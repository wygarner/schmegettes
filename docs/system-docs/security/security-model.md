# Security Model

**Source of truth:** `golib/auth/`, `golib/db/`, `api/internal/server/`, `game/internal/socket/`, `supabase/migrations/`, `supabase/config.toml`, `.claude/settings.json`, `.github/workflows/`

Who can reach each part of Schmegettes, how each part checks its caller, what each role may do, and the gaps still open. Secrets and their rotation are in [configuration-and-secrets.md](./configuration-and-secrets.md).

## 1. Trust boundaries

| Component | Who can call it | How it checks the caller | What it can reach |
|---|---|---|---|
| `web` | Anyone (public static site on Vercel) | Nothing; it holds only public values (`VITE_*`) | Supabase Auth, `api`, `game`, all with the player's JWT |
| `api` | Anyone on the internet | A Supabase JWT in `Authorization: Bearer` on every route except `/healthz` and `/version`, verified against the JWKS (`golib/auth`). CORS limited to `ALLOWED_ORIGINS` | Postgres as `app_service`, switching to `authenticated` per transaction |
| `game` | Anyone on the internet (WebSocket) | The JWT arrives as the subprotocol `bearer.{jwt}` and is verified before the upgrade; the `Origin` header must be in `ALLOWED_ORIGINS`; the caller must be a member of the room | Postgres as `app_service`, switching to `authenticated` or `game_engine` per transaction |
| `worker` | Nobody: no inbound traffic | — | Postgres as `app_service`; the owner role only for `import-clues`, run from `load-clues.yml` (staging, production) or a developer machine (local). The queue loop is **not yet implemented** |
| Supabase Auth | Anyone, with the public anon key | Supabase; anonymous sign-in and email/password sign-in are enabled; email confirmation is off and no email is ever sent | Issues the JWTs every other component trusts. A signed-in player's access token carries their email |
| Supabase Data API (PostgREST) | **Any signed-in player**, with their own JWT | Supabase; the `public` schema is exposed (`supabase/config.toml`, `[api] schemas`) | Whatever the `authenticated` grants and RLS policies allow, including the `create_room` and `join_room` functions. See Known gaps |
| Postgres | `api`, `game`, `worker` (as `app_service`); `deploy-prod.yml` and `load-clues.yml` (owner); the Data API | Role password; TLS | Everything, within each role's grants |
| Redis | `game` only | Password in `REDIS_URL`, private network or TLS | Room fan-out. **Not yet implemented**: no service uses Redis |
| CI (GitHub Actions) | Pushes and PRs to the repo | GitHub | Production credentials only inside the GitHub Environment `production` (`deploy-prod.yml`). Jira credentials as repo secrets |
| Agents (Claude) | The developer, in their checkout | `.claude/settings.json` allow / ask / deny rules | The local checkout. Denied: force-push, pushing to `production` or `develop`, `supabase db push` and `supabase link`, Jira API calls, reading `.env` files and `supabase/signing_keys.json`. Agents never call the Jira API |

**Merge tickets.** A guest moving into an account proves it owned the guest with a one-use merge ticket: 32 random bytes, stored only as a SHA-256 hash, valid 24 hours, spent in the same transaction as the move ([data-and-isolation.md](../architecture/data-and-isolation.md), "Account functions"). The client keeps it in `localStorage` until it's redeemed. Anyone holding it can only move that guest's history into their own account. Tickets are never logged.

**Tokens outlive deleted users.** A merged-away guest's or a deleted account's access token stays valid until it expires (at most 1 h, `jwt_expiry`). Writes with it fail (no profile; foreign keys), and reads find nothing of theirs. The client drops the session at once. Changing a password revokes the account's other sessions; their access tokens likewise last until they expire.

**Services do not call each other.** `api` returns the game socket URL to the client, and the client connects to `game` itself. Services share state only through Postgres, plus pgmq and Redis when those are built. Service-to-service tokens therefore don't apply. Revisit this if a direct call between services is ever added.

## 2. Roles

**Identity**

| Role | What it can do | Enforced by |
|---|---|---|
| Anonymous player | Play and join by code. History is kept while the session lasts | Supabase Auth issues a JWT; services treat it as any other user |
| Host | An anonymous player whose device spent a one-use host code: also create rooms, Start, Rematch | `public.hosts`, checked in `create_room()` and `start_game()` (and before a Rematch). Removing the row removes access |
| Signed-in player | Same as anonymous, plus history, seen clues, and host access on every device they sign in on. Signs in with email and password | Supabase Auth issues the JWT (`is_anonymous: false`); account-only actions are refused for guests by `private.*` functions, which check both the token and `auth.users.is_anonymous` |

Supabase Auth's Email provider is off and anonymous sign-ups are limited per IP: nobody signs in with email, and Schmegettes sends no email ([private access](../../product-docs/features/private-access/feature-brief.md)).

**In a room** (`public.player_role`)

| Role | What it can do | Enforced by |
|---|---|---|
| `host` | Start the game, judge answers, control the board | `game/` compares the caller's user ID with the room's host (`HostID`) |
| `contestant` | Buzz, answer, wager | `game/`, from the room's member list |
| `spectator` | Watch | `game/`, from the room's member list |

Every socket connection first passes `public.is_room_member`, run as the caller under RLS (`game/internal/socket`).

**Database** roles (`authenticated`, `app_service`, `game_engine`, owner, `anon`) are described in [data-and-isolation.md](../architecture/data-and-isolation.md), "Roles".

## 3. Isolation

A player sees only their own profile and the rooms and games they belong to. Postgres row-level security enforces this per transaction, never `WHERE` clauses in application code. Details and the policy table are in [data-and-isolation.md](../architecture/data-and-isolation.md).

## 4. Known gaps

Keep this list current. A PR that closes a gap removes its line.

| Gap | Planned approach |
|---|---|
| **Unverified account emails** | Email confirmation is off, so anyone can register an address they don't own and block its owner. The admin deletes the squatting account on request. Revisit if an email provider is ever added. |
| **Password guessing** | Limited only by Supabase Auth's per-IP limit on sign-ins and sign-ups (30 per 5 minutes, `sign_in_sign_ups`). No per-account lockout. Leaked-password checks are not enabled. |
| **Change password is checked on the client** | The web app verifies the current password by signing in with it before `updateUser`, because Supabase's server-side check (secure password change) needs email. Someone holding a stolen access token can change the password directly. |
| **No self-service password reset** | Resets need email. The admin resets by hand (deployment.md, "Supabase Auth settings"). |
| **Supabase Data API is exposed** | Any signed-in player can query `public` directly with their JWT, so RLS and function grants are the only boundary there. Decide whether to stop exposing `public` (the services don't need the Data API) or keep it and test it as a public surface. |
| **Rate limits** | Built: per-user limits in `api` on room codes (`join` group: `POST /v1/rooms/join`, `GET /v1/rooms/by-code/{code}`, 10/min) and host codes (`host-code`: 5/min), answering 429 with `Retry-After`; the rejection log line has only the group. Supabase Auth limits anonymous sign-ups per IP, which bounds how many identities one address can use. Still to do: limits on the rest of the `api`; the limiter is per instance (move it to Redis with a second instance). |
| **Audit table** | Append-only table for role and membership changes, credential changes, and staff access. Application code never updates or deletes rows. A failed write still lets the action complete but raises a critical alert. |
| **Staff access** to a room or player | An explicit, time-limited grant with a recorded reason, audited, with an alert when used. |
| **Web security headers** | Built: CSP, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy and `X-Robots-Tag` on every web response, written into `vercel.json` by `web/scripts/vercel-deploy.mjs` with the CSP built from each environment's origins; `web/scripts/vercel-deploy.test.ts` fails if a header is dropped. `style-src` allows `'unsafe-inline'` because Mantine renders `<style>` elements at runtime. `script-src` allows `'wasm-unsafe-eval'` (WebAssembly compilation only, never JavaScript `eval`) and `connect-src` allows `https://huggingface.co` and `https://*.hf.co`, both for the host device's narrator; the voice files are pinned by commit and checked by SHA-256 before use ([stack](../engineering/stack.md), Narration). CORS is already tested in `api/internal/server/server_test.go`, and the game's Origin check in `game/internal/socket/socket_test.go`. |
| **Telemetry and client error tracking** | Grafana Cloud shipping and Grafana Faro ([stack.md](../engineering/stack.md)). |
| **Required checks** | Branch protection and rulesets are not available on this private repo's GitHub plan (the API returns 403), so `CI Complete` cannot be a required check on `production`. Until it can, never merge a release with red CI ([release-strategy.md](../operations/release-strategy.md)). |
| **Security assessment** | First assessment before launch, then every six months and after major architecture changes. Findings go in `docs/security-assessments/{date}/remediation-tracker.md`, updated only through PRs. |
| **LLM appeal judge** (when built) | Player answers are untrusted input to the model. Tools get the least privilege that works. |
| **Docs that need hosting first** | `operations/observability.md`, `operations/incident-response.md`, `operations/disaster-recovery.md`, `operations/data-retention.md`, `operations/operator-scripts.md`, `quality/agent-qa.md`. |

## 5. Scans

In `ci.yml` on every PR into `develop` or `production`:

- secret scan: gitleaks
- dependency audits: `bun audit` (web, devtools), `govulncheck` (api, game), `pip-audit` (worker)

Dependabot keeps bun, Go (`api/`, `game/`, `golib/`), uv, and GitHub Actions dependencies current. A high-severity finding blocks a release until it is fixed or explicitly accepted in the release's internal notes.
