# Data and Isolation

**Source of truth:** `supabase/migrations/`, `golib/db/`

Isolation is enforced by Postgres row-level security, not by `WHERE` clauses in application code. The first migration (`supabase/migrations/20261026000000_init.sql`) builds it, and the tests in `supabase/tests/` (`rls.test.sql`, `game_history.test.sql`) prove it.

## Scope

Schmegettes has no organizations. A row belongs to **a user** (profile), **a room**, or **a game**. A user can see a room's data only while they are a member of it. A game's data is visible to everyone who played or watched it, permanently, even after they leave the room or it is deleted.

## Roles

| Role | Login | Used by | Can do |
|---|---|---|---|
| `postgres` (owner) | yes | migrations (`supabase db push`), worker catalog imports | everything; bypasses RLS |
| `app_service` | yes (password per environment) | api, game, worker connections | nothing directly; can only `set local role` to the two below |
| `authenticated` | no | every user-facing query | what the RLS policies allow for `auth.uid()` |
| `game_engine` | no | game server, through the engine functions (`start_game`, `reveal_clue`, `record_answer`, ...) | read everything incl. the clue catalog; write game state; never delete |
| `anon` | no | nothing (clients never query the database) | nothing |

`app_service` holds no table rights, so a query that forgets to switch role fails with "permission denied" instead of leaking data.

## The per-transaction pattern

Every service does this for each unit of work:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '<verified JWT claims as JSON>', true);
-- queries: auth.uid() is the caller; RLS applies
commit;
```

`set local` and the `true` argument scope both to the transaction, so a pooled connection never carries one user's identity into another request. Each language wraps this in one helper; see [stack.md](../engineering/stack.md), "Access patterns".

## Policies

| Table | authenticated can |
|---|---|
| `profiles` | read own and fellow room members'; insert/update own |
| `clues` | **nothing**: correct responses never reach a user role |
| `rooms` | read if host or member; create only via `create_room(name)`; no direct writes (status, `host_plays`, and settings change only through functions) |
| `room_members` | read fellow members; leave (non-host); join only via `join_room(code, name)`; never rename directly |
| `board_clues` | read if they played or watched that game (`is_game_member`), but during a game only clues already revealed: an unrevealed row would show where the Daily Doubles are and the Final category. Everything once the game ends. No writes |
| `games`, `game_players`, `answers`, `game_results` (view) | read if they played or watched that game (`is_game_member`); no writes |
| `wagers` | **nothing**: Daily Double and Final wagers, and submitted Final answers, are secret until the reveal. Their outcomes reach players only as `answers` rows |
| `seen_clues` | **nothing**: only used to build boards |
| `host_codes`, `hosts` | **nothing** (no role but the owner): host codes and who can host. Players reach them only through `private.*` functions |
| `private.merge_tickets` | **nothing** (no role but the owner): one-use tickets for moving a guest into an account, stored hashed. Reached only through the account functions |

Supabase's default grants to `anon`/`authenticated` are revoked, including default privileges for future tables. **Every new table needs an explicit grant, `enable row level security`, policies, and a test in `supabase/tests/`.**

## Lobby functions

Lobby changes go through `security definer` functions so names, capacity, and the start/join race are settled in one place ([lobby](../../product-docs/features/lobby/feature-brief.md)).

| Function | Caller | Does |
|---|---|---|
| `create_room(name)` | `authenticated` (api) | Closes the caller's other open lobbies, picks a code without look-alikes, adds the host's membership with their name |
| `join_room(code, name, role)` | `authenticated` (api) | Locks the room; refuses contestants unless `status = 'open'` and there is room (a playing host counts); suffixes a taken name ("Alice 2"); a member joining again keeps their name |
| `set_member_name(room, user, name)` | `game_engine` | Lobby only; same suffix rule |
| `set_host_plays(room, plays)` | `game_engine` | Lobby only; the host joins or leaves the game on the host device |
| `leave_room(room, user)` | `game_engine` | Removes a non-host member |

- `room_members.display_name` is the name in that room; `profiles.display_name` is the last name used. `start_game()` snapshots the room name into `game_players`.
- A host with `rooms.host_plays` is recorded in `game_players` as a `contestant`, so they count for fresh boards and placement.
- Room codes are unique only among rooms that aren't closed (`rooms_live_code_idx`).

## Private access functions

Schema `private` holds functions the Data API doesn't expose, so calling them means going through a service ([private access](../../product-docs/features/private-access/feature-brief.md)).

| Function | Caller | Does |
|---|---|---|
| `private.redeem_host_code(code)` | `authenticated` (api, rate-limited) | Normalizes the code (case, spaces, dashes); spends it for the caller with one `update … where used_at is null`, so two racing callers can't both win; adds the caller to `hosts`; creates a new unused code. A caller who can already host keeps the code unspent |
| `private.caller_is_host()` | `authenticated` (api) | Whether the caller can host |
| `private.user_is_host(user)` | `game_engine`; `create_room` and `start_game` | Whether a user can host. `create_room` and `start_game` raise `42501` without it |
| `private.new_host_code(note)` | owner only (admin, SQL editor) | Creates an unused code |

## Account functions

Accounts ([accounts](../../product-docs/features/accounts/feature-brief.md)): players sign in with email and password, and every sign-in moves the device's guest into the account. All four are `security definer` in schema `private`, granted to `authenticated`, and called by api (`api/internal/account`; the three that change state are rate-limited). A caller is a guest if either the token's `is_anonymous` or `auth.users.is_anonymous` says so.

| Function | Does |
|---|---|
| `private.set_account_name(name)` | Signed-in callers only (`42501`). Sets `profiles.account_name` (1–20 characters, `22023`), creating the profile if needed. Players can't write `account_name` directly |
| `private.create_merge_ticket()` | Guests only (`42501`). Replaces the guest's earlier tickets with a new one, valid 24 h |
| `private.merge_guest(ticket)` | Signed-in callers only (`42501`). Spends the ticket (`22023` if wrong, used, expired, or not a guest's); refuses while the guest is in an `in_game` room (`55006`, the ticket stays valid). Then moves the guest into the caller, below, and deletes the guest from `auth.users` |
| `private.delete_account()` | Signed-in callers only (`42501`); refused while in an `in_game` room (`55006`). Deletes the caller from `auth.users`; the cascades below do the rest |

Merging a guest into an account:

- `game_players`: the guest's rows move to the account, except in a game both were in; there the guest's row becomes "Former player" (`user_id` and `display_name` null).
- `games.host_user_id` and `host_codes.used_by` follow the guest to the account.
- `seen_clues`: merged; a clue both saw keeps the later `seen_at`.
- `hosts`: either one's host access is enough.
- Everything else the guest had (profile, memberships, lobbies it hosted) goes with the deleted guest.

`profiles.display_name` is the last name used in a room; `profiles.account_name` is the signed-in player's own name (leaderboard, name prefill), null for guests.

## History outlives rooms and accounts

- Deleting a room keeps its games (`games.room_id` becomes null).
- Each game records who hosted it (`games.host_user_id`, set by `start_game()`), so "Hosted by" in My games survives a deleted room. Deleting the host's account nulls it.
- Deleting an account (`private.delete_account()`) deletes its `seen_clues` and host access, nulls its name snapshots, and nulls `game_players.user_id`. Its results stay on other players' scoreboards as "Former player".
- Scores are never stored: `game_results` sums each player's `answers.score_delta`, so an override can't leave a stale total.

## Migration rules

- SQL files in `supabase/migrations/`, created with `supabase migration new {name}`. No other tool writes the schema.
- Compatible with the code already running: add columns nullable or with defaults; drop or rename only in a later release, after no deployed code uses the old shape.
- Enum values must match `shared/schemas/domain.schema.json`. Adding one means changing both in the same PR.
- Rehearsed on staging before every release.
