---
jira-type: new-feature
jira-title: "Accounts: sign in with Apple or Google to keep history and hosting"
---
# Accounts: task spec

Product brief: `tasks/accounts/product-brief.md`. Product docs: `docs/product-docs/features/accounts/` (feature brief and interaction design). Those docs are the source of truth for copy and screens; this spec covers how to build it.

## Approach

**Every sign-in moves the guest into the account.** The device's guest (an anonymous Supabase user) gets a short-lived **merge ticket** from the api. The client then signs in with Apple or Google through `supabase.auth.signInWithOAuth`. On return it redeems the ticket as the account, and one Postgres function moves the guest's games, seen clues, and host access into the account, then deletes the guest.

- First sign-in and returning sign-in run the same code: one redirect and one well-tested path. What the player sees matches the product docs ("the guest becomes the account" is true in effect; the user ID changes, which players never see).
- Rejected alternative: `linkIdentity` for first sign-ins plus a merge for returning ones. That needs two paths, and returning players get a second redirect after an `identity_already_exists` error.
- `linkIdentity` / `unlinkIdentity` is used only on the Account page, to connect the other provider to an account.
- The ticket lets the server trust that the caller really owned the guest. It is single-use, stored hashed, and lasts 24 h. The client keeps it in `localStorage` until it's redeemed, so a failed merge is retried when the app next loads (signed in, ticket still valid).

**No sign-in inside a room.** Entry points exist only on Home, My games, the host code sheet, and Account. The Stats entry point arrives with `stats-and-leaderboard`. The server also refuses a merge or deletion that would pull someone out of a game in progress (`409`).

## Subtasks

### 1. `shared/`: REST contract (additive, plus one never-implemented body change)

`shared/openapi.yaml`, then `mise run gen` and commit the output.

- `Profile`: add `accountName: [string, "null"]` (required in the response; null for guests). `GET /v1/me` summary becomes "The caller's profile" (no longer "created on first call").
- `PATCH /v1/me`: body becomes `{ accountName: string, minLength 1, maxLength 20 }` (`additionalProperties: false`). Returns `Profile`. `403 not-signed-in` for guests. **Not breaking:** both `/v1/me` handlers return 501 today and no client calls them.
- `DELETE /v1/me` (new): `204`. `403 not-signed-in` for guests; `409 in-game` while the caller is in a room whose status is `in_game`; `429`.
- `POST /v1/me/merge-tickets` (new): `201 MergeTicket { ticket: string, expiresAt: date-time }`. `409 not-a-guest` if the caller isn't anonymous; `429`.
- `POST /v1/me/merge` (new): body `{ ticket: string }`; `200 MergeResult { gamesAdded: integer, hostAccessAdded: boolean, accountWasNew: boolean }`. Errors: `400 invalid-ticket` (wrong, used, expired, or the caller's own); `403 not-signed-in` (caller is a guest); `409 guest-in-game` (the guest is in an `in_game` room); `429`.

Key files: `shared/openapi.yaml`; generated `api/internal/contracts/*`, `shared/` TS types.

### 2. `supabase/`: migration

See the database migration plan below. Also `supabase/config.toml`:

- `[auth] enable_manual_linking = true`
- `[auth.external.apple]` and `[auth.external.google]`: `enabled = true`, `client_id = "env(SUPABASE_AUTH_EXTERNAL_{APPLE,GOOGLE}_CLIENT_ID)"`, `secret = "env(SUPABASE_AUTH_EXTERNAL_{APPLE,GOOGLE}_SECRET)"`, `redirect_uri` left at the default.
- `additional_redirect_urls`: keep `http://localhost:5173`, and add `http://localhost:5173/**` so OAuth can return to any path.

Local sign-in needs developer OAuth credentials. Nothing else does: every test uses fake claims.

### 3. `golib/auth`: anonymous claim

- `Claims.IsAnonymous bool`, read from the token's `is_anonymous` claim (missing → false).
- Key files: `golib/auth/auth.go`, `auth_test.go`.

### 4. `api/`: account endpoints

New package `api/internal/account` (handler + `PGStore`, same shape as `hostaccess`):

- `GET /v1/me`: `db.AsUser`; reads `profiles` for the caller. No row → `displayName: ""`, `accountName: null`. `isAnonymous` comes from the claims.
- `PATCH /v1/me`: guest → 403. Upserts `profiles` (`account_name` = value; `display_name` = value only when inserting a new row). Trims; validates 1–20 characters.
- `POST /v1/me/merge-tickets`: `select * from private.create_merge_ticket()`.
- `POST /v1/me/merge`: `select * from private.merge_guest($1)`.
- `DELETE /v1/me`: `select private.delete_account()`.
- Map SQLSTATEs from the functions to problems: `22023` → `invalid-ticket`, `42501` → `not-signed-in` / `not-a-guest` (depending on the route), `55006` → `guest-in-game` / `in-game`.
- Rate limit: new group `account`, 10/min, burst 3, on the three POST/DELETE routes (`api/cmd/api/main.go`).
- Key files: `api/internal/account/{handler,store}.go` and tests; `api/cmd/api/routes.go` (replace the two `notImplemented` stubs, wire the new routes); the `routes` test stubs in `api/internal/{rooms,hostaccess,games}/handler_test.go` (they implement the generated interface, so they need the new methods).

### 5. `web/`: sign-in, merge, Account page, prompts

- `web/src/lib/supabase.ts`: `createClient(..., { auth: { flowType: "pkce" } })`. `getAccessToken` still signs in a guest when there's no session. Before doing that, if the `schmegettes.hadAccount` flag is set, it sets `schmegettes.signedOut` so Home shows the banner. Subscribe to `onAuthStateChange`: `SIGNED_OUT` with the flag set → same.
- `web/src/lib/account.ts` (new):
  - `startSignIn(provider)`: as a guest, `POST /v1/me/merge-tickets` → store `{ticket, expiresAt}` in `localStorage["schmegettes.mergeTicket"]` → `signInWithOAuth({ provider, options: { redirectTo: location.href } })`. If the ticket can't be created, don't redirect; show "Couldn't sign in. Try again."
  - `completeSignIn()`: on app load. Signed in (not anonymous) with an unexpired ticket stored → `POST /v1/me/merge`. On 200 or 400, clear the ticket. Keep it on network errors, 5xx, and 409. On 200, set `hadAccount` and return the result for the toast and the name prompt (`accountWasNew` or `accountName` null → name prompt).
  - Also: `signOut()` (`supabase.auth.signOut()`, clear `hadAccount`, then a fresh guest on the next token request), `deleteAccount()` (`DELETE /v1/me` then `signOut`), `connect(provider)` / `disconnect(provider)` (`linkIdentity` / `unlinkIdentity`; map `identity_already_exists` to the product copy), `isEmbeddedBrowser(userAgent)` (Instagram, Facebook, Messenger, LINE, TikTok, Snapchat, and generic `; wv)` Android WebViews), and the save-prompt state (`schmegettes.savePrompt`: `{ pending, snoozedUntil }`).
  - Every storage access is guarded, like `displayName.ts`.
- UI (copy and layouts from `interaction-design.md`):
  - `web/src/ui/SignInSheet.tsx`: Apple and Google buttons. Google is replaced by the in-app-browser message plus **Copy link** when `isEmbeddedBrowser`.
  - `web/src/ui/AccountNameSheet.tsx`: prefilled from `accountName`, then the last name used.
  - Home (`web/src/pages/Home.tsx`): account chip or **Sign in**, the signed-out banner, the "Save your games" sheet, and the sign-in result toast.
  - My games footer: **Sign in** button.
  - `HostCodeSheet.tsx`: the sign-in line for guests.
  - `web/src/pages/Account.tsx` at `/account` (route in `web/src/main.tsx`): name, connected providers, sign out, delete. Never shows an email address.
- Save prompt trigger: the **contestant** screen sets `savePrompt.pending` when the phase reaches `finished` and the player is a guest. It's shown on Home after Leave. Hosts and spectators never set it. Prefill: the join and host name prompts use `accountName` when signed in.
- Key files: the above plus `web/src/lib/displayName.ts` (prefill), and the contestant game view in `web/src/game/` and `web/src/pages/JoinRoom.tsx`.

### 6. Docs

See "Docs to update".

## Contracts preserved

- WebSocket protocol, jobs, and `domain.schema.json`: unchanged.
- REST: additive (new routes, new `Profile.accountName`, new problem kinds). `PATCH /v1/me`'s body changes, but it has never been implemented or called (501 today), so no deployed client breaks. Stays on `/v1`.
- JWT verification is unchanged. Apple- and Google-issued Supabase JWTs verify against the same JWKS.

## Database migration plan

`supabase migration new accounts` → `supabase/migrations/{timestamp}_accounts.sql`

**Tables**

- `public.profiles`: `add column account_name text check (char_length(account_name) between 1 and 20)`. Nullable, so it's compatible with running code. Existing RLS on `profiles` covers it.
- `private.merge_tickets (token_hash bytea primary key, guest_id uuid not null references auth.users (id) on delete cascade, expires_at timestamptz not null, created_at timestamptz not null default now())`
  - `enable row level security`; `revoke all … from public, anon, authenticated, app_service, game_engine`; no policies (the owner only, through the functions below). Index on `guest_id`.

**Functions** (all `security definer`, `set search_path = ''`, owner `postgres`; `revoke all from public`; `grant execute to authenticated`)

- `private.create_merge_ticket() returns table (ticket text, expires_at timestamptz)`
  - Caller must be anonymous (`auth.jwt()->>'is_anonymous' = 'true'` **and** `auth.users.is_anonymous`); else `42501`.
  - Deletes the caller's earlier tickets. Ticket = 32 bytes from `extensions.gen_random_bytes`, base64url. Stores `sha256`; TTL 24 h.
- `private.merge_guest(ticket text) returns table (games_added integer, host_access_added boolean, account_was_new boolean)`
  1. Caller (account A) must not be anonymous; else `42501`.
  2. `delete from private.merge_tickets where token_hash = sha256(...) and expires_at > now() returning guest_id` (single use). No row, guest = caller, or guest not anonymous → `22023`.
  3. Guest G is a member of an `in_game` room → `55006`. This happens before step 2's delete commits: the whole function is one transaction, so the ticket survives for a retry.
  4. `account_was_new` = A has no `profiles` row or `account_name` is null.
  5. If A has no profile and G has one, insert A's profile with G's `display_name` (FKs from `game_players` and `games.host_user_id` need it).
  6. `game_players`: move G's rows to A where A isn't already in that game (`unique (game_id, user_id)`). Remaining G rows → `user_id = null, display_name = null` ("Former player"). `games_added` = moved rows whose game is `finished` or `abandoned`.
  7. `games.host_user_id` G → A.
  8. `seen_clues`: upsert G's rows into A, `on conflict (user_id, clue_id) do update set seen_at = greatest(...)`.
  9. `hosts`: insert A from G's row `on conflict do nothing`. `host_access_added` = A wasn't a host and now is. `host_codes.used_by` G → A.
  10. `delete from auth.users where id = G`. The cascades remove the rest: profile, memberships, lobbies G hosted (their games keep `room_id = null`), and leftover tickets.
- `private.delete_account() returns void`
  - Caller not anonymous (`42501`); in an `in_game` room → `55006`.
  - `delete from auth.users where id = auth.uid()`. The existing cascades and `scrub_game_player_names` give "Former player", delete seen clues and host access, and null `games.host_user_id`.
- **Verify on staging:** that `postgres` can delete from `auth.users` inside a security-definer function on hosted Supabase. This is the usual Supabase pattern, but the rehearsal must prove it.

**pgTAP test** `supabase/tests/accounts.test.sql`

- `authenticated` can't select, insert, or delete `private.merge_tickets`, and can't execute anything in `private` beyond these grants.
- `create_merge_ticket`: refused for a non-anonymous caller; a new ticket replaces the old one.
- `merge_guest`:
  - Moves games (counts only finished and abandoned), host access, `host_user_id`, `used_by`, and seen clues (keeping the later `seen_at`), then deletes the guest.
  - Same-game collision: the account's row is kept; the guest's row has null `user_id` and `display_name`.
  - Refused for: a reused ticket, an expired one, the caller's own, an anonymous caller, and a guest in an `in_game` room (the ticket is still valid afterwards).
  - `account_was_new` is true then false.
- `delete_account`: the other players' rows read "Former player", and seen clues and hosts are gone. Refused for guests and while `in_game`.
- `profiles.account_name` length check.

**Compatibility:** the migration only adds (a nullable column, a private table, functions). Running api, game, and web code doesn't touch any of it.

## Success criteria

From the product brief, plus:

1. A guest with games and host access signs in with Apple. On a second browser, they sign in with Apple and see the same My games and can create a room without a code.
2. A guest plays a game on browser B and then signs in to an existing account. My games shows that game, the toast says "Added 1 game from this phone.", and the guest user no longer exists in `auth.users`.
3. Same person in one game as guest and as account: the account's result is kept and the guest's row reads "Former player".
4. A merge that fails (5xx or network) keeps the ticket and succeeds on the next load.
5. Lobby, game, end-of-game scoreboard, and every host-device screen render no sign-in UI.
6. Sign out leaves a fresh guest, and signing back in restores everything. Losing the session on a device that had an account shows the banner.
7. `DELETE /v1/me` gives "Former player" on others' scoreboards and removes host access. It returns `409` while in a game.
8. No email address is rendered, sent, stored by us, or logged.
9. Every new endpoint's responses validate against the OpenAPI copy in handler tests.

## Test plan

- **Database:** `supabase/tests/accounts.test.sql` (above). Run with `mise run db:test`.
- **golib:** `golib/auth/auth_test.go`, with `is_anonymous` true, false, and missing. Run: `cd golib && go test -race ./auth/...`
- **api:**
  - `api/internal/account/handler_test.go`: each route's statuses and problem kinds, response validation against `openapi30.gen.yaml`, guest vs account claims, rate limit group wiring.
  - `store_test.go`: against the local database, in the same style as `hostaccess/store_test.go`.
  - Update the `routes` stubs in the other handler tests.
  - Run: `mise run test:api -- ./internal/account/... ./internal/rooms/... ./internal/hostaccess/... ./internal/games/...`
- **web:**
  - `src/lib/account.test.ts`: ticket stored before the redirect and no redirect if creation fails; `completeSignIn` clears on 200/400 and keeps on 5xx/409/network; `isEmbeddedBrowser` table; save-prompt snooze; signed-out flag.
  - `src/pages/Account.test.tsx`, plus updates to `Home.test.tsx`, `MyGames.test.tsx`, and `HostCodeSheet.test.tsx`.
  - A test that the host lobby and game views contain no sign-in control.
  - Run: `mise run test:web -- src/lib/account.test.ts src/pages/Account.test.tsx src/pages/Home.test.tsx src/pages/MyGames.test.tsx src/pages/HostCodeSheet.test.tsx src/pages/HostLobby.test.tsx`
- **By hand (local, with dev OAuth credentials):** success criteria 1, 2, 5 and 6 in Safari and Chrome, and the in-app-browser message by spoofing the user agent.

## Logging requirements

Per `docs/system-docs/operations/logging-conventions.md`, api service logger:

| Event | Level | Fields |
|---|---|---|
| `guest merged` | info | `user_id` (account), `guest_id`, `games_added`, `host_access_added`, `request_id` |
| `merge refused` | info | `reason` (`invalid_ticket` / `guest_in_game` / `not_signed_in`), `user_id`, `request_id` |
| `account deleted` | info | `user_id`, `request_id` |
| `merge failed` / `account delete failed` | error | `err`, `user_id`, `request_id` |
| Rate limited | info | existing line, `group: account` only |

**Never logged:** merge tickets, JWTs or refresh tokens, emails, OAuth profile data, provider names tied to a user, request bodies. The web client logs nothing new.

## Docs to update

- `docs/system-docs/engineering/stack.md`: Identity provider row → "anonymous sign-in, then Apple or Google (`signInWithOAuth`, PKCE); a guest is merged into the account at sign-in". Bump "Last updated".
- `docs/system-docs/security/security-model.md`:
  - "Linked player" becomes "Signed-in player" (built).
  - Supabase Auth row: Apple and Google providers, manual linking on.
  - Note: a deleted or merged guest's access token stays valid until it expires (≤ 1 h). Its database writes fail because the profile is gone.
  - Add the merge ticket to trust boundaries.
- `docs/system-docs/architecture/data-and-isolation.md`:
  - An "Account functions" table (the three functions above).
  - `merge_tickets` in the policies table.
  - "History outlives rooms and accounts": add the merge rules (collision → Former player, seen clues keep the later time, host access is a union).
  - `profiles.account_name` vs `display_name`.
- `docs/system-docs/architecture/api-contract.md`: the new problem kinds `not-signed-in`, `not-a-guest`, `invalid-ticket`, `guest-in-game`, `in-game`.
- `docs/system-docs/security/configuration-and-secrets.md`:
  - `SUPABASE_AUTH_EXTERNAL_{APPLE,GOOGLE}_{CLIENT_ID,SECRET}` for local, and the dashboard settings for staging and production (providers, manual linking, redirect URLs).
  - **The Apple client secret is a JWT that expires after at most 6 months:** add a rotation reminder.
- `docs/system-docs/engineering/developer-setup.md`: optional local OAuth setup. Everything else works without it.
- Product docs: none. One behavior is slightly broader than `accounts/interaction-design.md`: a failed merge is retried on the next app load, not only at the next sign-in. Raise it with `/product` if the wording should change.

## Before release (human, not the implementation agent)

- An Apple Developer Services ID, key, and client secret, and a Google OAuth client, for staging and production. Configure both providers, manual linking, and the site's redirect URLs in each Supabase project's dashboard.
- Staging rehearsal proves `private.delete_account` and `private.merge_guest` can delete from `auth.users`.
