---
task-type: enhancement
task-title: "Host code in the app for admins"
---
# Task spec: in-app-host-code

Product brief: `tasks/in-app-host-code/product-brief.md`. Product docs: `docs/product-docs/features/private-access/feature-brief.md` ("Admin screen in the app", "Decisions (2026-11-21)") and `interaction-design.md` ("Admin screen in the app", with edge cases).

## Approach

**Reuse the existing admin API.** `GET /v1/admin/host-code` and `POST /v1/admin/host-code/rotate` (`expectedCode`) already do everything the screen needs:
- they return `AdminHostCode {code, currentStartedAt, rotatesAt, previousValidUntil, serverTime}`;
- they answer 404 `not-found` to non-admins;
- CORS is global (`api/cmd/api/routes.go`), so the web app's origin can already call them.

**How Home knows to show the row.** Probing `GET /v1/admin/host-code` on every Home visit would spend the shared `admin` rate limit (5/min per user) and log a 404 for every player. Instead, `Profile` (`GET /v1/me`, which Home already loads through `currentAccount()`) gets an optional `isAdmin: true`. It's present only for admins; everyone else gets the same response as today, so nothing leaks to non-admins. The api reads it with a new `private.caller_is_admin()` (the same check as `private.require_admin()`, returning a boolean), run as the user.

**Web:**
- **Home** (`pages/Home.tsx`): when `account.isAdmin`, one more `Row` after Stats, with icon `key` (add it to `ICONS` if missing), title "Admin", sub "Host code", linking to `/admin`.
- **`/admin`** (`pages/Admin.tsx`, new route in `main.tsx`), a `MenuScreen` with "‹ Home":
  - On mount it loads `currentAccount()`. Not an admin → `navigate("/", { replace: true })`. Then one `GET /v1/admin/host-code`. A 404 means the account was removed from the admin list → Home.
  - **Masking:** the code renders as `••••-••••` until **Show** (local state, never persisted). It masks again on unmount and on `visibilitychange` to hidden.
  - **Copy code:** `navigator.clipboard.writeText` with the dash, then a "Copied" toast. On failure, reveal the code.
  - **Times:** "Changes at {rotatesAt}" and "Previous code works until {previousValidUntil}" (when non-null), in local time, with the device clock offset from `serverTime`.
  - **Refresh:** one `setTimeout` to re-`GET` just after `rotatesAt`, which masks the new code. **No polling**, because of the admin rate limit.
  - **Rotate now:** the confirmation sheet from the interaction design, then `POST /v1/admin/host-code/rotate {expectedCode: code}`. Show the returned state, masked.
  - **Errors:** 429 → "Too many tries. Wait a minute and try again." Network error or 5xx → "Couldn't load the host code" with **Try again**.
  - **Environment line:** from the build's environment (`lib/env.ts`): "Local", "Staging", or "Production" in red.
- The devtools admin page is unchanged.

## Subtasks (narrow → wide)

1. **shared** (additive): `shared/openapi.yaml` `Profile.isAdmin` — `{ type: boolean, description: "Present and true only for accounts on the admin list" }`, not required. Run `mise run gen` and commit.
2. **supabase:**
   - `private.caller_is_admin()`: `returns boolean`, `stable`, security definer, `search_path = ''`, the same conditions as `require_admin()` (a non-anonymous `auth.users` row listed in `private.admins`), `false` otherwise.
   - Grant execute to `authenticated` (the api runs as the user), plus a pgTAP test.
3. **api:** `api/internal/account` — the profile read also selects `private.caller_is_admin()` and sets `IsAdmin` only when true. Add a handler test validated against the spec.
4. **web:**
   - `lib/account.ts`: `isAdmin` on `Account`
   - `pages/Home.tsx` row
   - `pages/Admin.tsx`
   - `main.tsx` route
   - `ui/menu.tsx` icon if needed
5. **docs:** see "Docs to update".

## Key files

- `shared/openapi.yaml` and the generated `api/internal/contracts/*` and web API types
- `supabase/migrations/{ts}_caller_is_admin.sql`, `supabase/tests/private_access.test.sql`
- `api/internal/account/store.go`, `handler.go`, `handler_test.go`
- `web/src/lib/account.ts`, `web/src/pages/Home.tsx` (+ test), `web/src/pages/Admin.tsx` (+ test), `web/src/main.tsx`

## Contracts preserved

One additive change: an optional `Profile.isAdmin`. All `/v1/admin/*` behavior is unchanged: non-admins still get 404 `not-found`, with the same rate limit. No socket change.

## Success criteria

- The product brief's success criteria.
- `GET /v1/me` for a non-admin, a guest, or an account removed from the list has no `isAdmin` key.
- `/admin` makes no admin API call for a non-admin (it redirects first) and at most one `GET` per rotation while open.
- The code is never in the DOM unmasked before **Show** (assert on text content, not just visibility).

## Test plan

- **db** (`mise run db:test`), in `supabase/tests/private_access.test.sql`, `private.caller_is_admin()`:
  - true for a listed account
  - false for an unlisted account, an anonymous user, and an unknown uid
  - executable by `authenticated`, not by `anon`
- **api** (`mise run test:api -- ./internal/account/...`):
  - `GET /v1/me` for an admin has `isAdmin: true`
  - a non-admin and a guest have no `isAdmin` key
  - the response validates against the spec
- **web**:
  - `mise run test:web -- src/pages/Admin.test.tsx`:
    - a non-admin is redirected and no admin request is made
    - the code is masked until Show
    - Copy writes `K7RX-M2PQ`
    - Rotate now confirms and posts `expectedCode`
    - the re-fetch is scheduled at `rotatesAt` (fake timers) and the new code is masked
    - 404 → Home; 429 → message
    - hidden on `visibilitychange`
  - `mise run test:web -- src/pages/Home.test.tsx`: the Admin row only when `isAdmin`
- **Agent QA**: on the local stack with an account added to `private.admins`:
  - read the code against the devtools page
  - Rotate now, and check that devtools shows the new code
  - a non-admin opening `/admin` lands on Home

## Database migration plan

- `supabase migration new caller_is_admin`: creates the function `private.caller_is_admin() returns boolean`.
- No table, so no RLS changes.
- Grants: `revoke all on function private.caller_is_admin() from public; grant execute on function private.caller_is_admin() to authenticated;`. `authenticated` already has `usage` on schema `private` (`*_private_access.sql`). The pgTAP test must call the function as `authenticated` and get a boolean back, so the grant is proven, not assumed.
- Compatible with the running code: a new function only; the old api never calls it.

## Logging requirements

- Admin requests from the web go through the existing admin middleware and its security-event lines (`logging-conventions.md` §6) unchanged.
- No new log lines. Never log the host code, the token, or an email. The web logs nothing about the code to the console.

## Docs to update

- `docs/system-docs/architecture/api-contract.md`: the admin routes are also used by the web app's `/admin`; `Profile.isAdmin`
- `docs/system-docs/security/security-model.md`: the Admin row ("Used from devtools …" → also from the web app's `/admin`, code and rotate only; `caller_is_admin()`)
- `docs/product-docs/features/private-access/feature-brief.md` and `interaction-design.md`: remove the "Not yet implemented (task `in-app-host-code`)" notes
- `docs/product-docs/architecture/design-system.md` "Home": the admin-only row
