---
jira-type: enhancement
jira-title: "Rotating host codes and an admin page in devtools"
---
# Task spec: host-code-rotation

Product brief: `tasks/host-code-rotation/product-brief.md`. Product rules and UI copy: `docs/product-docs/features/private-access/feature-brief.md` and `interaction-design.md`.

**Scope:** replace one-use host-code redemption with one shared code that rotates every 45 minutes with a 5-minute scheduled grace period; add an owner-managed admin allowlist and admin REST operations; add the local-only devtools Admin page for local, staging, and production. Existing hosts keep access. The public web screens and game protocol do not change.

## Approach

- **Rotation lives in Postgres.** One owner-only singleton row points at the current and previous `public.host_codes` rows and records `current_started_at`, `rotates_at`, and `previous_valid_until`. Security-definer functions take one transaction-scoped advisory lock before reading or changing it. No api-process timer or worker is authoritative.
- **Scheduled rotation is materialized on access.** Reading the admin code or redeeming a code first advances an expired schedule. It creates the code for the current 45-minute window, retains the prior code only through its 5-minute grace, and skips unobserved windows instead of creating unusable rows. The devtools page fetches at `rotatesAt`, so an open page changes automatically without reload; redemption is correct even if no admin page is open.
- **Manual rotation is race-safe.** The request carries the code the admin confirmed as `expectedCode`. Under the same database lock, the first request retires it immediately and starts a new 45-minute schedule; a concurrent request whose expected code is stale returns the already-created current code instead of rotating twice. Manual rotation gives the retired code no grace.
- **Admin access uses the caller's normal Supabase JWT.** `private.admins` contains account user IDs and is maintained only in SQL. Every admin database function checks both that the caller is a non-anonymous account and that its ID is on that list. The api still connects as `app_service` and calls every function inside `db.AsUser`; there is no owner connection, service-role key, or database URL in devtools.
- **Admin denials are concealed.** Missing/invalid authentication, guests, and signed-in non-admins receive the api's ordinary not-found response from every `/v1/admin/*` route. The admin route group is rate-limited. Devtools maps a failed password and a successful login followed by an admin denial to the same copy: "Can't sign in as an admin here."

## Subtasks

### 1. Add the REST contract in `shared/`

Extend `shared/openapi.yaml` additively and run `mise run gen`.

Add these operations:

| Method and path | Purpose | Successful response |
|---|---|---|
| `GET /v1/admin/host-code` | Read/materialize the current rotation | `AdminHostCode` |
| `POST /v1/admin/host-code/rotate` | Rotate only if the confirmed code is still current | `AdminHostCode` |
| `GET /v1/admin/hosts` | List hosts newest first | `{ hosts: AdminHost[] }` |
| `PATCH /v1/admin/hosts/{userId}` | Set or clear the admin-only note | updated `AdminHost` |
| `DELETE /v1/admin/hosts/{userId}` | Remove host access | `204` (idempotent) |

Contract shapes:

- `AdminHostCode`: `code` (the existing 8-character alphabet), `currentStartedAt`, `rotatesAt`, nullable `previousValidUntil`, and `serverTime`, all timestamps in RFC 3339 UTC. `serverTime` lets devtools calculate the countdown without trusting the laptop clock.
- Rotate body: required `expectedCode`, normalized like redemption and limited to the existing input length. A stale expectation is not an error; it returns the current state.
- `AdminHost`: `userId`, `kind` (`account` or `guest`), nullable `email`, nullable `lastPlayedAs`, `hostSince`, and nullable `note`. Accounts carry `email`; guests carry the latest `profiles.display_name` when one exists. Do not collapse this into an untyped display string.
- Note body: required nullable `note`; trim it in the database, store empty as null, and cap it at 200 characters in both OpenAPI and the database.
- Every operation documents `404` using the same `Problem` response used for an unknown page, plus `429 RateLimited`. Mutation routes also document `400` for an invalid body/path value. Do not expose an `admin-forbidden` problem kind.

Update and commit generated TypeScript and Go contracts (`shared/generated/ts/openapi.ts`, `api/internal/contracts/openapi30.gen.yaml`, `contracts_gen.go`). Existing `/v1/host-access` response and redemption request shapes stay unchanged; update only their one-use descriptions.

### 2. Add rotating-code and admin storage in Supabase

Create `supabase/migrations/<timestamp>_host_code_rotation.sql` with `supabase migration new host_code_rotation`.

Schema changes (additive only):

- Add nullable `note text` to `public.hosts`, with a 200-character check. Do not change its `user_id` primary key, `code` foreign key, or `created_at`; these preserve one row per host and the original "since" time.
- Add `private.admins(user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now())`.
- Add a one-row `private.host_code_rotation` table with a constrained singleton key; foreign keys for `current_code` and nullable `previous_code`; and `current_started_at`, `rotates_at`, and nullable `previous_valid_until`. Enforce timestamp ordering with checks.
- Enable RLS on both new tables. Revoke every table privilege from `public`, `anon`, `authenticated`, `app_service`, and `game_engine`; add no direct policies. Only owner-run setup SQL and the security-definer functions can see them. Revoke default/public function execution before granting the minimum functions below.

Replace/extend the private functions:

- Keep `private.new_host_code(text)` as the single code generator, owner-only. Rotation calls it; players still cannot.
- Add an internal, non-granted helper that locks and advances rotation. At the first scheduled boundary it makes the old current code the previous code through `old_rotates_at + interval '5 minutes'`, creates one new code, and advances `rotates_at` in 45-minute UTC increments. If several windows elapsed, anchor the new row to the most recent elapsed boundary and make only that window current.
- Replace `private.redeem_host_code(text)` without changing its signature or grant. Normalize case/spaces/dashes; under the lock accept the current code before `rotates_at`, or the previous code strictly before `previous_valid_until`. Insert `public.hosts(user_id, code)` with `on conflict (user_id) do nothing`, so any number of callers can redeem the same valid code and an existing host remains one host with their original `created_at`. Wrong, expired, and manually retired codes all return false. Stop writing `host_codes.used_at/used_by` and stop minting a code per redemption; retain those columns for compatibility with already-running code and historical rows.
- Add a non-granted `private.require_admin()` helper. It rejects a null caller, an anonymous `auth.users` row, or a caller absent from `private.admins` with one indistinguishable SQLSTATE that the api maps to not-found.
- Add narrowly granted admin functions for current-code state, compare-and-rotate, host listing, note update, and host removal. Each invokes `require_admin()` in the same transaction. Listing joins `hosts` to `auth.users` and `profiles` only after authorization.

Migration/rollout behavior:

- Create one fresh rotating code and initialize the singleton on the UTC 45-minute grid (for example, a migration at 12:17 uses `current_started_at = 12:00` and `rotates_at = 12:45`). Existing unused one-use codes become unusable because the new redemption function consults only rotation state; do not delete or rewrite them.
- Preserve every `public.hosts` row, so existing hosts keep access.
- The migration must work while the old api is still running: existing function signatures and table columns remain. The old api can call the replacement `redeem_host_code` safely during the rolling deploy.
- Do not seed an admin in a migration. Document the one-time, owner-run insert by account email for local, staging, and production; it must reject/avoid anonymous users. The owner completes it before release.

Rewrite `supabase/tests/private_access.test.sql` around shared rotation and add its new table/grant/admin cases there. Cover at minimum:

1. Two different callers, including concurrent callers in the Go store integration test, redeem the same current code and both become hosts.
2. Redeeming again does not duplicate the host or change `created_at`.
3. A scheduled rotation accepts the previous code before 5 minutes and refuses it at/after 5 minutes.
4. A manual rotation refuses the old code immediately and starts the next 45-minute period at the manual time.
5. Two rotations with the same expected code yield one new code.
6. Advancing across several idle windows produces one current code with the correct most-recent UTC boundary.
7. Old unused one-use rows are not accepted; pre-migration host rows remain.
8. Players, guests, `anon`, `app_service`, and `game_engine` cannot read/write either new table or call admin functions outside their intended role.
9. A signed-in non-admin and a guest get the same admin denial; a listed non-anonymous account can read/update/remove, including removing its own host access.
10. Host list identity, newest-first ordering, note trimming/clearing/limit, and delete behavior are correct.

Adjust seed/fixture SQL that assumes a one-use code only where the migration makes it stale. Keep the stable `hosts.code` fixture relationship.

### 3. Implement the admin api and update host redemption

Add `api/internal/admin/` with handler, store, unit tests, and local-Supabase integration tests. All store methods use `DB.AsUser(ctx, claims, fn)` and call only the `private.*` functions from subtask 2. Never query `auth.users`, `private.admins`, `host_codes`, or `hosts` directly on the service connection.

Wire the generated operations in `api/cmd/api/routes.go` and `main.go`:

- Add one `admin` rate-limit group at **5 requests/minute with burst 5**, shared by all `/v1/admin/*` operations. A 429 keeps the existing `Retry-After` response. Apply the limiter to admin attempts, including unauthenticated attempts: valid tokens use the verified user ID and missing/invalid tokens share a bounded unauthenticated bucket. Never log or retain bearer tokens as keys.
- Make auth failures on `/v1/admin/*` return the same status, content type, and body as an unknown api path; keep the existing 401 behavior for every non-admin route. Valid guest/non-admin tokens reach the database authorization check and map its denial to that exact response.
- Map an expired/revoked session or removal from `private.admins` on the next request to the same concealed 404. Do not cache admin authorization in the api process or JWT.
- Keep ordinary handler/store errors as 500. Invalid notes/identifiers are 400. A delete of a missing host is a 204, so a repeated confirmed removal is harmless.
- Update `api/internal/hostaccess` comments and integration tests for multi-use current/previous codes. The public handler and its invalid-code/rate-limit behavior do not otherwise change.
- Add `http://localhost:5174` to local api CORS defaults/examples and document that staging and production `ALLOWED_ORIGINS` must include it. CORS is not the authorization boundary.

Handler/contract tests must validate every admin success response against `openapi30.gen.yaml`. Add explicit tests for every method with: no token, bad token, guest token, signed-in non-admin token, admin token, rate limiting, expired/removed admin behavior, and store failures. The no/bad/guest/non-admin responses must match the unknown-path response exactly.

### 4. Build the devtools Admin page

Add a first-class **Admin** item to `devtools/src/main.tsx`; keep design prototypes unchanged. Put implementation under `devtools/src/admin/`.

- Add `@schmegettes/shared`, `@supabase/supabase-js`, and `openapi-fetch` as exact/workspace dependencies. Use the generated OpenAPI types; do not hand-write response types.
- Add a checked `devtools/.env.example` and typed environment loader for local/staging/production, each with public Supabase URL, public anon key, and api URL. These are public client configuration, never database credentials or a service-role key. Fail visibly when a selected environment is not configured.
- Create a separate Supabase client/session storage key per environment. Use email/password `signInWithPassword`; never sign in anonymously. Changing environment signs out/tears down the old client state and keeps the new environment selection.
- After password authentication, load the admin data. A concealed 404 signs out that environment and shows "Can't sign in as an admin here." This is also the copy for Supabase's invalid-credential result. Do not reveal whether an email is registered or on the allowlist.
- Keep access/refresh tokens only in the Supabase client/session storage and the `Authorization` header. Never render or log them. Signing out clears the selected environment's session.
- Render the interaction design exactly: red production treatment; signed-in account; formatted current code and copy button; countdown and UTC rotation time; previous-code grace deadline when present; confirmed **Rotate now**; newest-first host list; account email or `Guest` plus last-played name; since time; inline nullable note editing; confirmed **Remove**.
- Drive the countdown from `serverTime`/`rotatesAt`. Schedule a refetch at the boundary and after the grace deadline; also refresh code and hosts after mutations. Do not poll more often than the api rate limit permits.
- On 401/404 from a later action, return to sign-in with the environment kept. On network failure show "Can't reach {environment}." and **Try again**; do not display cached codes or hosts. A 429 honors `Retry-After` and disables the action until retry.
- Confirmation copy comes from the interaction design and uses the code/identity currently displayed. Send that displayed code as `expectedCode`; replace local state with the response so concurrent admin rotation converges.

Add Vitest + Testing Library/jsdom setup to devtools, a `test` script, and `mise run test:devtools`. Update the devtools CI job to run targeted-quality equivalents for the package (build, Biome, and coverage/tests).

Component/library tests cover:

- environment selection, red production styling, missing public config, and separate sessions;
- successful sign-in and generic copy for bad credentials, guest, and non-admin;
- current code/countdown/grace display and automatic boundary refetch with fake timers;
- rotate confirmation and `expectedCode`, including a stale concurrent response;
- account and guest rows, newest-first rendering, note save/clear, and remove confirmation;
- session expiry/admin removal returns to sign-in while retaining environment;
- unreachable environment clears sensitive data and offers retry;
- 429 respects `Retry-After`; and
- no token, password, or full response is written to the console.

### 5. Documentation and operator setup

Update the docs listed below in the same implementation PR. Clearly separate the checked-in change from the pre-release owner action: create/sign in to the owner's account, add its user ID to `private.admins` in each environment, and add the devtools localhost origin to each api's `ALLOWED_ORIGINS` before the release. Never put an owner database URL on the laptop running devtools.

## Key files

| Subtask | Files |
|---|---|
| 1 | `shared/openapi.yaml`; generated `shared/generated/ts/openapi.ts`, `api/internal/contracts/openapi30.gen.yaml`, `api/internal/contracts/contracts_gen.go` |
| 2 | `supabase/migrations/<timestamp>_host_code_rotation.sql` (new); `supabase/tests/private_access.test.sql`; `supabase/seed.sql` and affected SQL fixtures only as needed |
| 3 | `api/internal/admin/*` (new); `api/internal/hostaccess/*`; `api/internal/server/*`; `api/internal/ratelimit/*`; `api/cmd/api/main.go`, `routes.go`; `api/.env.example` |
| 4 | `devtools/src/admin/*` (new); `devtools/src/main.tsx`; `devtools/src/test/setup.ts`; `devtools/.env.example`; `devtools/package.json`, `vite.config.ts`, `tsconfig.json`; `bun.lock`; `mise.toml`; `.github/workflows/ci.yml` |
| 5 | product/system/operations docs named under "Docs to update" |

## Contracts preserved

- **REST changes are additive.** `/v1/admin/*` and its schemas are new under the existing `/v1` API. Existing client operations and fields remain. `/v1/host-access/redeem` keeps the same request, successful response, `invalid-code` response, and 5/minute limit; only which codes are valid changes.
- **Database compatibility is additive.** No table/column/function used by deployed code is dropped or renamed. `private.redeem_host_code(text)`, `private.caller_is_host()`, and `private.user_is_host(uuid)` keep their signatures and grants. Legacy `host_codes.note/used_at/used_by` remain for old code/history but are no longer part of redemption.
- **Host and gameplay contracts are preserved.** `public.hosts` remains one row per user; create, Start, and Rematch keep checking it. Removing a row has the existing effect. `shared/schemas/protocol/`, `game/`, and public `web/` do not change.
- **Isolation is preserved.** Players still cannot read host codes, host rows, admin membership, account emails, or notes. Only an authorized admin gets those fields through api functions executed as that caller.

## Success criteria

1. On staging, devtools signs in with a normal allowlisted account and shows the current code within 10 seconds, with no database/service-role credential on the machine.
2. Two fresh guest devices redeem the same current code, each becomes one host, and an already-authorized account redeeming it remains one host.
3. At scheduled rotation, an open admin page shows the new code without reload. The old code works before 5:00 of grace and fails at/after 5:00.
4. **Rotate now** makes one new code, immediately refuses the old code, and schedules the next rotation 45 minutes later. Two simultaneous admins still produce only one new code and converge on it.
5. Wrong, malformed, expired, and manually retired codes all keep the public "That code didn't work." response; the existing 5/minute public redemption limit still applies.
6. A signed-in non-admin, a guest, a missing token, and an invalid token receive the same not-found response from every admin endpoint. Repeated calls are rate-limited. Tests prove both properties.
7. Hosts appear once, newest first, with account email or guest last-played name, original access time, and editable nullable note. Removing one makes their next create, Start, or Rematch fail while an in-progress game remains playable.
8. Removing an admin or expiring their session is enforced on the next action and returns devtools to sign-in with the environment selected.
9. Existing hosts retain access across the migration; every unused legacy one-use code stops working.
10. Local, staging, and production are selectable; production is unmistakably red; an unreachable environment exposes no cached code/list and offers retry.

## Test plan

### Tests to write

- **Contracts:** regenerate all consumers and keep handler response validation for every new route.
- **Database:** the rotation, concurrency-visible state, time boundaries, grants/RLS, allowlist, admin data, notes, removal, and rollout cases listed in subtask 2 in `supabase/tests/private_access.test.sql`.
- **Api:** `api/internal/admin/handler_test.go`, `store_test.go`, route/auth/rate-limit tests, plus updated `api/internal/hostaccess` tests. Use local Supabase integration tests for real JWT claims and concurrent redemptions/rotations; unit tests fake the store for exact HTTP behavior.
- **Devtools:** admin client/auth/countdown/component tests listed in subtask 4 with fake Supabase/api clients and fake timers. No test calls staging or production.

### Targeted validation commands

```bash
mise run gen
mise run db:test
mise run test:api -- ./internal/admin/... ./internal/hostaccess/... ./internal/server/... ./internal/ratelimit/... ./cmd/api/...
mise run test:devtools -- src/admin src/main.test.tsx

cd api && go vet ./internal/admin/... ./internal/hostaccess/... ./internal/server/... ./internal/ratelimit/... ./cmd/api/...
bunx biome check shared/openapi.yaml devtools/src devtools/vite.config.ts devtools/package.json mise.toml .github/workflows/ci.yml
bun run --cwd devtools build
supabase db lint
```

For api integration tests, start/reset local Supabase and export only the public anon key plus the documented local test database URLs, as the existing store tests do. Do not read or commit any `.env` file. Do not run the full Go, web, or repository test suite.

### Manual checks

1. Local: sign in as an allowlisted account; verify code countdown, scheduled refresh, copy, note editing, host removal, sign-out, and generic non-admin rejection.
2. Staging, two fresh browser profiles/devices: redeem the same code, then rotate and prove the old code fails and the returned new code works.
3. Staging, two Admin tabs: confirm the same displayed code in both and press Rotate simultaneously; verify both settle on one code and one 45-minute deadline.
4. Staging: remove a host in a lobby and verify Start is refused; remove one mid-game and verify play finishes but Rematch is refused.
5. Switch between staging and production and verify the production treatment cannot be mistaken for staging. Simulate an unreachable api and an expired admin session.

## Database migration plan

- Command/name: `supabase migration new host_code_rotation` → `supabase/migrations/<timestamp>_host_code_rotation.sql`.
- Tables: new owner-only `private.admins` and singleton `private.host_code_rotation`; both have RLS enabled, explicit revokes, and no direct policies. Add only nullable/default-safe fields to existing tables (`public.hosts.note`).
- Functions/grants: keep existing player/game function signatures; add internal rotation/admin guards and only the authenticated execution grants needed for api calls. Direct table access remains unavailable to `authenticated`, `app_service`, and `game_engine`.
- pgTAP: rewrite/extend `supabase/tests/private_access.test.sql` for the cases in subtask 2. This is the required new-table RLS/grant test.
- Compatibility: additive and safe with the already-running api. No drop or rename. Existing hosts survive; legacy unused codes are retained as rows but intentionally excluded by the replacement redemption function.

## Logging requirements

- Use the existing Go `slog` request logger. Static messages, `err` for failures, and `request_id`/`user_id` where already available.
- `info`: successful manual rotation (no code; include only `request_id` and admin `user_id`), host access removed (target user ID is allowed), note updated (never the note), and admin rate-limit rejections through the existing limiter.
- `debug` or no event: wrong/expired public host code and concealed admin denials. They are expected/security-sensitive outcomes, not errors. Move the existing public host-code rejection from `info` to `debug` (or remove it); never include the submitted code.
- `error`: database/internal failures at the handler boundary, with `err`, `request_id`, and caller `user_id`. Do not log response/request bodies.
- Never log host codes, passwords, JWT/refresh tokens, Authorization headers, email addresses, notes, full host lists, or full payloads. No browser `console.log`; caught devtools failures show safe UI copy, and `console.error` must not include Supabase/api response objects.

## Docs to update

- `docs/product-docs/features/private-access/feature-brief.md` and `interaction-design.md`: remove the rotating-code/admin-page **Not yet implemented** markers; keep the exact behavior/copy aligned with implementation.
- `docs/system-docs/architecture/data-and-isolation.md`: rotation/admin tables, grants, functions, shared-code redemption, and host-note ownership; remove one-use behavior.
- `docs/system-docs/architecture/api-contract.md`: additive admin routes, concealed 404, and updated valid-code semantics.
- `docs/system-docs/engineering/stack.md`: devtools now owns the local Admin page and talks to Supabase Auth + api; keep the no-owner-access rule explicit.
- `docs/system-docs/engineering/testing-strategy.md`: devtools Vitest task/CI coverage.
- `docs/system-docs/engineering/developer-setup.md`: configure public devtools environment values, add a local admin, and use the rotating `DEVS-TEST` replacement workflow.
- `docs/system-docs/security/security-model.md`: Admin identity/allowlist, concealed/rate-limited admin surface, account-email exposure only to admins, and localhost devtools CORS.
- `docs/system-docs/security/configuration-and-secrets.md`: devtools public variables and `ALLOWED_ORIGINS` including `http://localhost:5174`; reiterate that anon keys are public and owner/service-role/database credentials are forbidden.
- `docs/system-docs/operations/deployment.md`: pre-release owner allowlist insert for all three environments, deployed api CORS update, current-code verification, and removal of the SQL-editor code-reading instructions.

## Branch

Implementation: `enhancement/host-code-rotation-impl`, fresh from and into `daily/2026-11-17`. No Jira key: Jira setup is not complete (`development-workflow.md`, "Jira setup"), so the task folder keeps its current name and PR titles use `host-code-rotation` in place of `SCH-{N}`.

