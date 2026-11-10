---
jira-type: new-feature
jira-title: "Private access: invite-only hosting"
---
# Task spec: private-access

Product brief: [product-brief.md](./product-brief.md). Rules: [private access](../../docs/product-docs/features/private-access/feature-brief.md) and its [interaction design](../../docs/product-docs/features/private-access/interaction-design.md).

**Ordering:** must be live in production before the production clue load (`clue-catalog`). The clue loader checks for `public.hosts` (this task's migration). Otherwise independent.

## What already exists

- **Web**: `web/src/lib/supabase.ts` signs in anonymously on first use (`getAccessToken`). On `Home.tsx`, **Host a game** opens a name modal, then `createRoom` (`POST /v1/rooms`).
- **Database**:
  - `public.create_room(host_name)` (`20261027174627_lobby.sql`) is `security definer`, runs as the caller, and is reached through `api/internal/rooms/store.go`.
  - `public.start_game(target_room)` (latest in `20261109210750_games_host.sql`) runs as `game_engine` from `game/internal/room/pgstore.go`.
  - **Rematch** (`room.go`, `rematch`) only returns the room to the lobby. The next Start calls `start_game`.
- **Contracts**:
  - Socket errors use `contracts.Error{Code}` with the enum in `shared/schemas/protocol/server-message.schema.json`.
  - REST errors are `Problem` (`server.Problem(w, status, kind, title)`).
- **Auth**: `supabase/config.toml` enables anonymous sign-in and signup. The email provider is on by Supabase's default, so anyone with the anon key can create email accounts and trigger emails today.
- **Rate limits**: none exist. They're a known gap in `security-model.md`. `golang.org/x/time` is already in `api/go.mod` (indirect).
- **Room codes**: `create_room` generates them from the alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. Host codes reuse it.
- **pgTAP tests**: five files call `create_room` or `start_game` with test hosts in `auth.users`.

## Approach

- **Host access is a row in `public.hosts` keyed by the device's existing anonymous `user_id`.** No email, no identity linking, so history is untouched.
- **Codes live in `public.host_codes`.** Redeeming one, in one statement:
  1. `update … set used_at = now(), used_by = caller where code = $1 and used_at is null returning`. A concurrent second redeemer updates 0 rows.
  2. Inserts the caller into `hosts`.
  3. Inserts one new unused code.
- **The checks live in the database**, inside `create_room` and `start_game`, so every path (api, game, the Data API) is covered by one rule. Rematch adds a check through the same function, so it fails before resetting.
- **Helper functions go in a `private` schema** (not exposed by the Data API), so redemption can only be reached through the rate-limited api endpoint.
- **Email sign-in is switched off in Supabase Auth.** That closes the "trigger an email to any address" gap entirely; nothing in Schmegettes sends email.
- **Guessing limits**:
  - Host codes have 31⁸ ≈ 8.5 × 10¹¹ possibilities, at 5 tries per minute per user.
  - Room codes: 10 tries per minute per user.
  - A new anonymous identity costs one anonymous sign-in, which Supabase limits per IP (set below), so per-user limits bound per-IP guessing without a trusted-IP header (hosting isn't chosen).

## Subtasks

### 1. Contracts (`shared/`), additive only

- `shared/openapi.yaml`:
  - `POST /v1/rooms`: add `"403"` Problem (`not-a-host`, "Hosting is invite-only").
  - `POST /v1/rooms/join` and `GET /v1/rooms/by-code/{code}`: add `"429"` Problem (`rate-limited`) with a `Retry-After` header (seconds).
  - New `GET /v1/host-access`, authenticated: `200 { canHost: boolean }`.
  - New `POST /v1/host-access/redeem`, authenticated:
    - body `{ code: string (maxLength 16) }`
    - `200 { canHost: true }`
    - `400` Problem (`invalid-code`): wrong, spent, or malformed. One message for all, so it reveals nothing.
    - `429` as above.
- `shared/schemas/protocol/server-message.schema.json`: add `not_a_host` to the `Error.code` enum.
- Run `mise run gen`; commit the generated TS, Go, Python, and `openapi30.gen.yaml`.

### 2. Migration (`supabase migration new private_access`)

```sql
create schema if not exists private;  -- not in the Data API's exposed schemas
revoke all on schema private from public;
grant usage on schema private to authenticated, game_engine;

create table public.host_codes (
  code text primary key check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
  note text,                     -- admin: who it's for
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);
create table public.hosts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null references public.host_codes (code),
  created_at timestamptz not null default now()
);
alter table public.host_codes enable row level security;
alter table public.hosts enable row level security;
revoke all on public.host_codes, public.hosts from public, anon, authenticated, app_service, game_engine;
-- No policies: only the owner (admin, SQL editor) reads or writes these.
```

All functions are `security definer`, `set search_path = ''`, with explicit `revoke all … from public` and the grants listed:

- `private.new_host_code(note text default null) returns text`: generates 8 random characters from the alphabet (`gen_random_bytes`; retry on the rare collision), inserts, and returns. No grant to user roles; called by `redeem_host_code` and by the admin.
- `private.user_is_host(target_user uuid) returns boolean` (`stable`): `exists (select 1 from public.hosts where user_id = target_user)`. Grant `execute` to `game_engine`.
- `private.caller_is_host() returns boolean` (`stable`): the same check for `auth.uid()`. Grant to `authenticated`.
- `private.redeem_host_code(candidate text) returns boolean`. Grant to `authenticated`.
  - Normalize: `upper`, then strip spaces and `-`.
  - If the caller is null, return false. If the caller is already a host, return true without spending the code.
  - Otherwise, the `update … returning` from Approach. On one row: insert into `hosts`, call `private.new_host_code()`, return true. On zero rows: return false.
- `create or replace function public.create_room(host_name text)` (copy the latest body from `20261027174627_lobby.sql`):
  - right after the `caller is null` check: `if not private.caller_is_host() then raise exception 'not a host' using errcode = '42501'; end if;`
- `create or replace function public.start_game(target_room uuid)` (copy the latest body from `20261109210750_games_host.sql`):
  - after loading the room: `if not private.user_is_host(room.host_id) then raise exception 'not a host' using errcode = '42501'; end if;`
  - before anything is written.
- **First code**: the migration ends with `select private.new_host_code('first code');`. Read it after the release with `select code from public.host_codes where used_at is null;`.
- **Rollout**: no data change to rooms (owner approved). Lobbies opened by hosts without access can't Start and close after 30 min idle.
- `supabase/seed.sql`:
  - `insert into public.host_codes (code, note) values ('DEVSTEST', 'local') on conflict do nothing;`
  - with a comment: enter `DEVS-TEST` locally; after it's used, read the new code with the query above, or `mise run db:reset`.

### 3. Supabase Auth config (`supabase/config.toml`)

- `[auth.email]`: `enable_signup = false`. Keep `[auth]` `enable_signup = true` and `enable_anonymous_sign_ins = true`, which anonymous sign-in needs.
- `[auth.rate_limit]`: `anonymous_users = 30` (per hour per IP).
- Hosted projects (staging, production): set the same in each project's Auth settings (Email provider off; anonymous on; the anonymous rate limit). Write the checklist into `deployment.md`.

### 4. API (`api/`)

- `internal/rooms/store.go` `mapError`: `42501` → `ErrNotAHost`. `handler.go` `fail`: `ErrNotAHost` → `403 not-a-host`.
- New package `internal/hostaccess` (`handler.go`, `store.go`), wired in `cmd/api/routes.go`:
  - `Status`: `select private.caller_is_host()` inside `db.AsUser` → `{canHost}`.
  - `Redeem`:
    - The body is decoded and must be at most 16 characters (else `400 invalid-code`).
    - It runs `select private.redeem_host_code($1)` inside `db.AsUser`.
    - true → `200 {canHost: true}`; false → `400 invalid-code`.
- New package `internal/ratelimit`:
  - Per-user token buckets (`golang.org/x/time/rate`, promote it to a direct dependency) keyed by JWT `sub`, with idle buckets evicted after 10 min.
  - Middleware `ratelimit.PerUser(group, perMinute, burst)`. When limited: `429 rate-limited` with `Retry-After`.
  - Groups:
    - `join` (`POST /v1/rooms/join`, `GET /v1/rooms/by-code/{code}`): **10/min, burst 10**
    - `host-code` (`POST /v1/host-access/redeem`): **5/min, burst 5**
  - Per instance. Note the move to Redis when there's more than one instance.

### 5. Game (`game/`)

- `internal/room/pgstore.go`:
  - `mapError`: `42501` → `ErrNotAHost`.
  - New `HostCanHost(ctx, roomID) (bool, error)`: `select private.user_is_host(host_id) from public.rooms where id = $1`, as `game_engine`. Add it to the store interface and test fakes.
- `internal/room/room.go` `start`: on `ErrNotAHost`, set the phase back to lobby and send `contracts.Error{Code: not_a_host, Message: "Your host access was removed, so you can't start games."}` to the **host's** clients only. Log at `info`.
- `rematch`: call `HostCanHost` first. On false, send the same error to the host, leave the finished game in place, and don't reset. On a database error, log and send `internal`.

### 6. Web (`web/`)

- `src/lib/hostAccess.ts`:
  - `getHostAccess(): Promise<boolean>` (`GET /v1/host-access`).
  - `redeemHostCode(code) → "ok" | "invalid" | "rate-limited"`.
  - `formatHostCode(input)`: upper-case, keep only alphabet characters, max 8, dash after 4.
- `src/pages/HostCodeSheet.tsx` (new), built with `ui/Sheet`, as in the interaction design:
  - **Continue** is enabled at 8 characters.
  - `invalid` → "That code didn't work." (keep the text).
  - `rate-limited` → "Too many tries. Wait a minute and try again.", with **Continue** disabled for the `Retry-After` seconds.
- `src/pages/Home.tsx`:
  - **Host a game**: check `getHostAccess()`. If false, open `HostCodeSheet`; on success, or if already true, open the existing name modal.
  - On `createRoom` 403 `not-a-host` (access removed), open `HostCodeSheet`.
- Host lobby and game screens: show the `not_a_host` error message on the host device, as other socket errors are shown.
- `index.html`: `<meta name="robots" content="noindex, nofollow">`. `public/robots.txt`: `User-agent: *` / `Disallow: /`.

### 7. Docs (see "Docs to update")

## Contracts preserved / changed

Additive only:
- two new endpoints
- new 403/429 responses on existing operations
- a new socket error code

Existing clients keep working. An old web build gets a 403 on create (shown as "Couldn't create a room") until it reloads. `mise run gen` output is committed.

## Success criteria

- pgTAP:
  - `create_room` raises `42501` for a user without host access, and succeeds after `redeem_host_code`.
  - Redeeming a valid code marks it used (`used_by` = caller), inserts the host, and leaves exactly one new unused code.
  - Redeeming a spent or unknown code returns false and changes nothing.
  - An existing host redeeming returns true and does not spend the code.
  - Normalization accepts `devs-test` and `DEVS TEST`.
  - `start_game` raises `42501` after the host row is deleted.
  - `authenticated`, `anon`, and `app_service` can't select or modify `host_codes` or `hosts`.
  - `private.*` functions aren't executable by `anon`, and `new_host_code` isn't executable by `authenticated`.
- Concurrency: two sessions redeeming the same code; exactly one gets true. Use a Go store test (DB-backed) with two goroutines.
- api:
  - `POST /v1/rooms` → 403 without access.
  - The 11th join attempt in a minute → 429 with `Retry-After`.
  - Redeem: no token → 401, bad code → 400, the 6th try in a minute → 429.
  - `GET /v1/host-access` reflects redemption.
- game:
  - Start without access → `not_a_host` to the host only, and the phase is back to lobby.
  - Rematch without access → `not_a_host`, and the room is not reset.
- web:
  - **Host a game** without access shows the sheet.
  - A valid code continues to the name prompt.
  - An invalid code shows the message and keeps the text.
  - 429 disables **Continue**.
  - A 403 on create opens the sheet.
- Local Supabase rejects `signUp` / `signInWithOtp` with an email; anonymous sign-in works.
- By hand, locally: `DEVS-TEST` grants host access, and a full game is hosted. A second browser joins anonymously and plays. The host's earlier games still appear in **My games**.
- `curl` of `/` shows the robots meta, and `/robots.txt` disallows all.

## Test plan

| Package | Tests | Command |
|---|---|---|
| supabase | New `supabase/tests/private_access.test.sql` (the cases above). **Update existing fixtures**: `lobby.test.sql`, `rls.test.sql`, `gameplay.test.sql`, `wagers.test.sql`, `game_history.test.sql` insert their host users into `public.hosts` (with a fixture code in `host_codes`) | `mise run db:test` |
| api | `internal/ratelimit/ratelimit_test.go` (burst, refill, eviction, 429 + Retry-After); `internal/hostaccess/handler_test.go` (401, 400, 200 validated against the OpenAPI copy); `internal/hostaccess/store_test.go` (DB-backed: redemption and the concurrent race); `internal/rooms/handler_test.go` (403 mapping); `internal/rooms/store_test.go` (seed a host for its test user) | `mise run test:api -- ./internal/ratelimit/... ./internal/hostaccess/... ./internal/rooms/...` |
| game | `internal/room/room_test.go`: Start refused (error to host only, phase back to lobby), Rematch refused (no reset), Rematch store error → `internal` | `mise run test:game -- ./internal/room/...` |
| web | `src/pages/HostCodeSheet.test.tsx`; `src/pages/Home.test.tsx` (with and without access, 403 → sheet); `src/lib/hostAccess.test.ts` (`formatHostCode`) | `mise run test:web -- src/pages/HostCodeSheet.test.tsx src/pages/Home.test.tsx src/lib/hostAccess.test.ts` |
| shared | Contract tests | `mise run gen` (commit the output); CI checks no diff |

## Database migration plan

- File: `supabase migration new private_access` → `supabase/migrations/{timestamp}_private_access.sql`.
- New schema `private` (not exposed by the Data API; usage granted to `authenticated` and `game_engine`).
- New tables `public.host_codes` and `public.hosts`: RLS enabled, no policies, all privileges revoked from `public`, `anon`, `authenticated`, `app_service`, and `game_engine`. Owner-only. Test: `supabase/tests/private_access.test.sql`.
- Four `security definer` functions in `private` with `search_path = ''` and explicit revoke/grant (above). `gen_random_bytes` needs `pgcrypto` (Supabase installs it in `extensions`; call it as `extensions.gen_random_bytes`).
- `create or replace` of `public.create_room` and `public.start_game` with unchanged signatures. Re-state their existing `revoke`/`grant` lines after the replace, as earlier migrations do.
- **Compatibility with running code**: the old api and game keep working against the new schema. The only behavior change is the refusal, which old code reports as a generic failure until the new code deploys. No column changes to existing tables.
- **Effect on every environment at deploy**: `hosts` starts empty, so **nobody can host** until the admin hands out the first code (owner approved). Put the query for reading it in the release notes.

## Logging requirements

- api:
  - `host code redeemed` at `info`, no fields beyond the request id. **Never the code.**
  - `host code rejected` at `info`, with no code and no user id.
  - `rate limited` at `info`, with `group` only (no IP, no user id, per `security-model.md`).
- game:
  - `start refused: not a host` at `info`, with `room_id`.
  - `rematch refused: not a host` at `info`, with `room_id`.
- web: no `console` output with codes.
- No tokens or host codes in any log at any level.

## Docs to update

- `docs/product-docs/features/private-access/feature-brief.md` and `interaction-design.md`: remove the banners, and add how the admin reads codes, adds extra codes (`select private.new_host_code('for Sam');`), and removes a host (`delete from public.hosts where code = '…';`).
- `docs/product-docs/features/lobby/feature-brief.md` and `docs/product-docs/architecture/product-overview.md`: remove the "Not yet implemented" notes.
- `docs/system-docs/security/security-model.md`:
  - Identity table: add "Host (has host access)", and anonymous without access can't host.
  - Known gaps: rate limits partly closed (join-by-code and host codes, per user, per instance); the email provider is off.
- `docs/system-docs/architecture/data-and-isolation.md`: `host_codes`, `hosts`, the `private` schema, and who can call what.
- `docs/system-docs/architecture/api-contract.md`: the host-access endpoints, 403/429.
- `docs/system-docs/architecture/realtime-game-server.md`: `not_a_host` on Start and Rematch.
- `docs/system-docs/operations/deployment.md`:
  - the Supabase Auth checklist per environment (Email provider off, anonymous on, anonymous rate limit)
  - reading the first host code after a release
  - the web host's `X-Robots-Tag: noindex` requirement
- `docs/system-docs/engineering/developer-setup.md`: local host code `DEVS-TEST`.

## Branch

`new-feature/private-access-impl`, from and into `daily/2026-11-10`. Implementation PR title: `[New Feature] private-access: …`. Merge the daily branch in before opening the PR; the final commit deletes `tasks/private-access/`.
