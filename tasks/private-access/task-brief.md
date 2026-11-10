---
jira-type: new-feature
jira-title: "Private access: invite-only hosting"
---
# Task spec: private-access

Product brief: [product-brief.md](./product-brief.md). Rules: [private access](../../docs/product-docs/features/private-access/feature-brief.md) and its [interaction design](../../docs/product-docs/features/private-access/interaction-design.md).

**Ordering:** must be live in production before the production clue load (`clue-catalog`). The clue loader checks for `public.host_invites` (this task's migration). Otherwise independent.

## What already exists

- **Web**: `web/src/lib/supabase.ts` signs in anonymously on first use (`getAccessToken`). `isAnonymous()` exists. On `Home.tsx`, **Host a game** opens a name modal, then `createRoom` (`POST /v1/rooms`).
- **Database**:
  - `public.create_room(host_name)` (`20261027174627_lobby.sql`) is `security definer`, runs as the caller, and is reached through `api/internal/rooms/store.go`.
  - `public.start_game(target_room)` (latest in `20261109210750_games_host.sql`) runs as `game_engine` from `game/internal/room/pgstore.go`.
  - **Rematch** (`room.go`, `rematch`) only returns the room to the lobby. The next Start calls `start_game`.
- **Contracts**:
  - Socket errors use `contracts.Error{Code}` with the enum in `shared/schemas/protocol/server-message.schema.json`.
  - REST errors are `Problem` (`server.Problem(w, status, kind, title)`).
- **Auth**: `supabase/config.toml` has only anonymous sign-in and signup enabled. Local email goes to Supabase's built-in mail catcher (Mailpit/Inbucket, `http://127.0.0.1:54324`). No SMTP, templates, OTP settings, or rate limits are set.
- **Rate limits**: none exist. They're a known gap in `security-model.md`. `golang.org/x/time` is already in `api/go.mod` (indirect).
- **pgTAP tests**: they create `auth.users (id, email)` without `email_confirmed_at`. Five files call `create_room` or `start_game`.

## Approach

- **The invite check lives in the database**, inside `create_room` and `start_game`, so every path (api, game, the Data API) is covered by one rule. Rematch adds a check through the same function, so it fails before resetting the room.
- **Invited** means: `auth.users.email` is set and confirmed, lower-cased, and present in `public.host_invites`.
- **Sign-in uses Supabase email OTP.** One email holds both the link (`{{ .ConfirmationURL }}`) and the 6-digit code (`{{ .Token }}`).
  - **Anonymous device**: `supabase.auth.updateUser({ email })` links the email to the anonymous account (an `email_change` message). History is kept.
  - **Email already registered** (`updateUser` returns `email_exists`): fall back to `signInWithOtp({ email, options: { shouldCreateUser: false } })` (a `magiclink` message). The device switches accounts, as the product doc says.
  - **Code entry**: `verifyOtp({ email, token, type })` with `type` = `email_change` or `email`, matching the path taken.
- **Only invited addresses get an email.** The web asks `POST /v1/host-access/check` first and calls Supabase Auth only on `invited: true`.
  - **Known gap (recorded, not fixed here):** a client calling Supabase Auth directly can still trigger an email to any address, limited by Auth's per-IP rate limits. The fix is a Send Email hook in `api`, which also needs the email provider's API. That's a follow-up.
- **Code guessing**: an in-process per-user limiter in `api` on join-by-code and the invite check. A new anonymous identity costs one anonymous sign-in, and Supabase limits those per IP (set below), so per-user limits bound per-IP guessing without a trusted-IP header (hosting isn't chosen).

## Subtasks

### 1. Contracts (`shared/`), additive only

- `shared/openapi.yaml`:
  - `POST /v1/rooms`: add `"403"` Problem (`not-invited`, "Hosting is invite-only").
  - `POST /v1/rooms/join` and `GET /v1/rooms/by-code/{code}`: add `"429"` Problem (`rate-limited`) with a `Retry-After` header (seconds).
  - New `POST /v1/host-access/check`, authenticated:
    - body `{ email: string (format email, maxLength 254) }`
    - `200 { invited: boolean }`; `400` Problem (`invalid-email`); `429` as above.
- `shared/schemas/protocol/server-message.schema.json`: add `not_invited` to the `Error.code` enum.
- Run `mise run gen`; commit the generated TS, Go, Python, and `openapi30.gen.yaml`.

### 2. Migration (`supabase migration new private_access`)

```sql
create schema if not exists private;  -- not in the Data API's exposed schemas
revoke all on schema private from public;
grant usage on schema private to authenticated, game_engine;

create table public.host_invites (
  email text primary key check (email = lower(btrim(email)) and email <> ''),
  note text,
  created_at timestamptz not null default now()
);
alter table public.host_invites enable row level security;
revoke all on public.host_invites from public, anon, authenticated, app_service, game_engine;
-- No policies: only the owner (admin, SQL editor) reads or writes invites.
```

- `private.user_is_invited(target_user uuid) returns boolean`:
  - `security definer`, `set search_path = ''`, `stable`.
  - True when an `auth.users` row has `id = target_user`, `email is not null`, `email_confirmed_at is not null`, and `lower(email)` is in `public.host_invites`.
  - `revoke all … from public`; `grant execute … to game_engine`.
- `private.caller_is_invited() returns boolean`: the same check for `auth.uid()`. Granted to `authenticated`.
- `private.email_is_invited(candidate text) returns boolean`: `lower(btrim(candidate))` in `host_invites`. Granted to `authenticated` and used by the api's check endpoint. It lives in `private` so the Data API can't call it around the api's rate limit.
- `create or replace function public.create_room(host_name text)` (copy the latest body from `20261027174627_lobby.sql`):
  - right after the `caller is null` check, add `if not private.caller_is_invited() then raise exception 'not invited' using errcode = '42501'; end if;`
- `create or replace function public.start_game(target_room uuid)` (copy the latest body from `20261109210750_games_host.sql`):
  - after loading the room, `if not private.user_is_invited(room.host_id) then raise exception 'not invited' using errcode = '42501'; end if;`
  - before anything is written.
- **Rollout**: no data change. Lobbies opened by uninvited hosts before the deploy can't Start (refused) and close after 30 min idle as usual. This intentionally differs from the product doc's "closed at rollout": there are no production users yet, and closing rooms from SQL wouldn't notify the game server's in-memory rooms. **Flagged for approval.**
- `supabase/seed.sql`:
  - `insert into public.host_invites (email) values ('host@local.test') on conflict do nothing;`
  - with a comment: sign in locally with this address and read the email at `http://127.0.0.1:54324`.

### 3. API (`api/`)

- `internal/rooms/store.go` `mapError`: `42501` → `ErrNotInvited`. `handler.go` `fail`: `ErrNotInvited` → `403 not-invited`.
- New package `internal/hostaccess` (`handler.go`, `store.go`):
  - `Check` validates the email (trim, ≤254, contains one `@`), else `400 invalid-email`.
  - It runs `select private.email_is_invited($1)` inside `db.AsUser` and returns `{invited}`.
  - Wire `PostV1HostAccessCheck` in `cmd/api/routes.go`.
- New package `internal/ratelimit`:
  - Per-user token buckets (`golang.org/x/time/rate`, promote it to a direct dependency) keyed by JWT `sub`, with idle buckets evicted after 10 min.
  - Middleware `ratelimit.PerUser(group, limit, burst)`. When limited: `429 rate-limited` with `Retry-After`.
  - Limits:
    - `join` group (`POST /v1/rooms/join`, `GET /v1/rooms/by-code/{code}`): **10/min, burst 10**
    - `invite-check` group: **5/min, burst 5**
  - Applied in `cmd/api/routes.go` around those operations only.
  - Per instance. Note the move to Redis when there's more than one instance.

### 4. Game (`game/`)

- `internal/room/pgstore.go`:
  - `mapError`: `42501` → `ErrNotInvited`.
  - New `HostInvited(ctx, roomID) (bool, error)`: `select private.user_is_invited(host_id) from public.rooms where id = $1`, as `game_engine`. Add it to the store interface and the test fakes.
- `internal/room/room.go` `start`: on `ErrNotInvited`, set the phase back to lobby and send `contracts.Error{Code: not_invited, Message: "Your invite was removed, so you can't start games."}` to the **host's** clients only. Log at `info`, not `error` (an expected refusal).
- `rematch`: call `HostInvited` first. On false, send the same error to the host, leave the finished game in place, and don't reset. On a database error, log and send `internal`.

### 5. Supabase Auth config

- `supabase/config.toml` (local):
  - `[auth]`: `additional_redirect_urls` add `http://localhost:5173/auth/link`.
  - `[auth.email]`: `enable_signup = true`, `double_confirm_changes = false` (an anonymous user has no old address to confirm), `enable_confirmations = false`, `otp_length = 6`, `otp_expiry = 3600`, `max_frequency = "60s"`.
  - `[auth.email.template.magic_link]` and `[auth.email.template.email_change]`: subject "Your Schmegettes sign-in link", `content_path = "./templates/sign-in.html"`.
  - `[auth.rate_limit]`: `email_sent = 30` (per hour), `token_verifications = 30` (per 5 min per IP), `anonymous_users = 30` (per hour per IP), `sign_in_sign_ups = 30`.
- `supabase/templates/sign-in.html`: link button (`{{ .ConfirmationURL }}`), the code (`{{ .Token }}`), and "On a different device or app? Use this code instead." Plain, no images, no show references.
- **Hosted projects** (staging, production): the same settings, plus custom SMTP and Site URL / redirect URLs, are set in each Supabase project's dashboard. Write the checklist into `deployment.md`. Not automated in this task.

### 6. Web (`web/`)

- `src/lib/supabase.ts`:
  - `currentEmail(): Promise<string | null>` (non-anonymous only), and `signOut()` (then the next action signs in anonymously again).
  - `requestHostSignIn(email) → "sent" | "not-invited" | "rate-limited"`:
    1. `POST /v1/host-access/check`.
    2. When invited: `updateUser({ email }, { emailRedirectTo: origin + "/auth/link" })`.
    3. On `email_exists`: `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } })`.
    4. Remember which path was taken in `sessionStorage` (`email_change` or `email`).
  - `verifyHostCode(email, code)`: `verifyOtp` with the remembered type.
- `src/lib/hostAccess.ts`: the check call (`api.ts` client).
- `src/pages/HostSignIn.tsx` (new): the email sheet, check-your-email sheet, and not-invited sheet from the interaction design, built with `ui/Sheet`.
  - Resend shows a 60 s countdown.
  - The sixth digit submits.
  - After 5 wrong codes, show "Too many tries. Send a new code." and disable the field until Resend.
  - Subscribe to `supabase.auth.onAuthStateChange`. When the session becomes non-anonymous (the link was opened in another tab of the same browser), continue to the name prompt.
- `src/pages/AuthLink.tsx` (new), route `/auth/link` in `main.tsx`:
  - Lets supabase-js finish the session from the URL (`detectSessionInUrl`; call `exchangeCodeForSession` if the URL has `code`), then navigates to `/?host=1`.
  - On error: "This sign-in link has expired. Ask for a new one on the device you're hosting from."
- `src/pages/Home.tsx`:
  - **Host a game**: if anonymous, open `HostSignIn`; otherwise the existing name modal. `?host=1` opens the name modal directly once signed in.
  - On `createRoom` 403 `not-invited`, show the not-invited sheet.
  - Under the buttons when signed in: "Signed in as {email} · Sign out".
- Host lobby and game screens: show the `not_invited` error message on the host device (as other socket errors are shown).
- `index.html`: `<meta name="robots" content="noindex, nofollow">`. `public/robots.txt`: `User-agent: *` / `Disallow: /`.

### 7. Docs (see "Docs to update")

## Contracts preserved / changed

Additive only:
- a new endpoint
- new 403/429 responses on existing operations
- a new socket error code

Existing clients keep working. An old web build gets a 403 on create (shown as "Couldn't create a room") until it reloads. `mise run gen` output is committed.

## Success criteria

- pgTAP:
  - An anonymous user and a confirmed-but-uninvited user get `42501` from `create_room`; an invited, confirmed user succeeds (case/space-insensitive match).
  - `start_game` gets `42501` after the host's invite is deleted.
  - `authenticated`, `anon`, and `app_service` can't select or insert `host_invites`.
  - `private.*` functions aren't executable by `anon`.
  - `private.email_is_invited` returns only a boolean.
- api:
  - `POST /v1/rooms` → 403 for an uninvited user.
  - The 11th join attempt in a minute → 429 with `Retry-After`.
  - The check endpoint: no token → 401, bad email → 400, 6th call → 429.
- game: Start with an uninvited host → `not_invited` to the host only, and the phase is back to lobby. Rematch with an uninvited host → `not_invited`, and the room is not reset.
- web:
  - Anonymous **Host a game** shows the email sheet.
  - An uninvited address shows the not-invited sheet and never calls Supabase Auth.
  - The code path continues to the name prompt.
  - 5 wrong codes lock the field.
  - A signed-in host sees "Signed in as".
- By hand, locally (Mailpit): `host@local.test` signs in by link and, separately, by code, then hosts a full game. A second browser joins anonymously and plays. Anonymous games from before sign-in still appear in **My games**.
- `curl` of `/` shows the robots meta, and `/robots.txt` disallows all.

## Test plan

| Package | Tests | Command |
|---|---|---|
| supabase | New `supabase/tests/private_access.test.sql` (the cases above). **Update existing fixtures**: `lobby.test.sql`, `rls.test.sql`, `gameplay.test.sql`, `wagers.test.sql`, `game_history.test.sql` set `email_confirmed_at = now()` on their host users and insert those emails into `host_invites` | `mise run db:test` |
| api | `internal/ratelimit/ratelimit_test.go` (burst, refill, eviction, 429 + Retry-After); `internal/hostaccess/handler_test.go` (401, 400, 200 shapes validated against the OpenAPI copy); `internal/rooms/handler_test.go` (403 mapping); `internal/rooms/store_test.go` (DB-backed: seed an invite for its test host) | `mise run test:api -- ./internal/ratelimit/... ./internal/hostaccess/... ./internal/rooms/...` |
| game | `internal/room/room_test.go`: Start refused (error to host only, phase back to lobby), Rematch refused (no reset), Rematch store error → `internal` | `mise run test:game -- ./internal/room/...` |
| web | `src/pages/HostSignIn.test.tsx` (sheets, countdown, 5-try lock, auth-state continuation); `src/pages/Home.test.tsx` (anonymous vs signed-in Host a game, 403 → not-invited sheet, "Signed in as"); `src/pages/AuthLink.test.tsx` (success → `/?host=1`, expired message) | `mise run test:web -- src/pages/HostSignIn.test.tsx src/pages/Home.test.tsx src/pages/AuthLink.test.tsx` |
| shared | Contract tests | `mise run gen` (commit the output); CI checks no diff |

## Database migration plan

- File: `supabase migration new private_access` → `supabase/migrations/{timestamp}_private_access.sql`.
- New schema `private` (not exposed by the Data API; usage granted to `authenticated` and `game_engine`).
- New table `public.host_invites`: RLS enabled, no policies, all privileges revoked from `public`, `anon`, `authenticated`, `app_service`, and `game_engine`. Owner-only. Test: `supabase/tests/private_access.test.sql`.
- Three `security definer` functions in `private` with `search_path = ''` and explicit revoke/grant (above).
- `create or replace` of `public.create_room` and `public.start_game` with unchanged signatures and grants. Re-state the existing `revoke`/`grant` lines after the replace, as earlier migrations do.
- **Compatibility with running code**: the old api and game keep working against the new schema. The only behavior change is the refusal, which old code reports as a generic failure ("Couldn't create a room" / "Couldn't build a board") until the new code deploys. No column changes.
- **Effect on every environment at deploy**: `host_invites` starts empty, so **nobody can host** until the admin inserts invites (one `insert` per host in the SQL editor). Put this in the release notes.

## Logging requirements

- api:
  - `invite check` at `debug` only, with `invited` (bool). **Never the email.**
  - `rate limited` at `info` with `group` only (no IP, no user id, per `security-model.md`).
  - The existing request log line covers 403s.
- game:
  - `start refused: host not invited` at `info` with `room_id`.
  - `rematch refused: host not invited` at `info` with `room_id`.
- web: no `console` output with emails or codes.
- No tokens, codes, OTP links, or email addresses in any log at any level.

## Docs to update

- `docs/product-docs/features/private-access/feature-brief.md` and `interaction-design.md`:
  - remove the banners
  - state the rollout as built (lobbies aren't actively closed)
  - Rematch is refused before the reset
- `docs/product-docs/features/lobby/feature-brief.md` and `docs/product-docs/architecture/product-overview.md`: remove the "Not yet implemented" notes.
- `docs/system-docs/security/security-model.md`:
  - Identity table: add "Invited host", and anonymous can't host.
  - Known gaps: rate limits partly closed (join-by-code and invite check, per user, per instance); add "sign-in emails can be requested for any address by calling Supabase Auth directly; bounded by Auth rate limits; fix with a Send Email hook".
- `docs/system-docs/architecture/data-and-isolation.md`: `host_invites`, the `private` schema, and who can call what.
- `docs/system-docs/architecture/api-contract.md`: the check endpoint, 403/429.
- `docs/system-docs/architecture/realtime-game-server.md`: `not_invited` on Start and Rematch.
- `docs/system-docs/security/configuration-and-secrets.md`: SMTP credentials (owner, where they live: each Supabase project's Auth settings, rotation).
- `docs/system-docs/operations/deployment.md`:
  - the Supabase Auth checklist per environment (SMTP, template, OTP length/expiry, max frequency, rate limits, Site URL and `/auth/link` redirect)
  - adding invites
  - the web host's `X-Robots-Tag: noindex` requirement
- `docs/system-docs/engineering/developer-setup.md`: local host sign-in with `host@local.test` and Mailpit at `127.0.0.1:54324`.

## Branch

`new-feature/private-access-impl`, from and into `daily/2026-11-10`. Implementation PR title: `[New Feature] private-access: …`. Merge the daily branch in before opening the PR; the final commit deletes `tasks/private-access/`.
