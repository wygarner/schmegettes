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
| `profiles` | read own and fellow room members'; insert/update own. `show_on_leaderboard` defaults true and is writable only on the caller's row |
| `clues` | **nothing**: correct responses never reach a user role |
| `rooms` | read if host or member; create only via `create_room(name)`; no direct writes (status, `host_plays`, and settings change only through functions) |
| `room_members` | read fellow members; leave (non-host); join only via `join_room(code, name)`; never rename directly |
| `board_clues` | read if they played or watched that game (`is_game_member`), but during a game only clues already revealed: an unrevealed row would show where the Daily Doubles are and the Final category. Everything once the game ends. No writes |
| `games`, `game_players`, `answers`, `game_results` (view) | read if they played or watched that game (`is_game_member`); no writes |
| `wagers` | **nothing**: Daily Double and Final wagers, and submitted Final answers, are secret until the reveal. Their outcomes reach players only as `answers` rows |
| `seen_clues` | **nothing**: only used to build boards |
| `category_difficulty` | **nothing**: each category's difficulty score and label (Easy, Medium, Hard). Players never see a category's label. `game_engine` reads it to build boards; only the owner (the worker's `rate-clues`) writes it |
| `difficulty_scale` | **nothing** (no role but the owner): the cut points between the labels, one row per kind (board, final), written once by the first complete rating run |
| `host_codes`, `hosts` | **nothing** (no role but the owner): host codes and who can host (with the admin's note). Players reach them only through `private.*` functions; admins only through the `private.admin_*` functions |
| `private.host_code_rotation` | **nothing** (no role but the owner): one row naming the current code, when it rotates, and the previous code with its grace deadline |
| `private.admins` | **nothing** (no role but the owner): account user IDs allowed to use the admin functions. Edited only in the SQL editor |
| `private.merge_tickets` | **nothing** (no role but the owner): one-use tickets for moving a guest into an account, stored hashed. Reached only through the account functions |
| `private.audit_log` | **nothing** (no role but the owner; RLS on, no policies, privileges revoked from every app role): the append-only audit log. Written only by `private.audit`; read by the admin through `private.admin_audit` (below) |
| `private.cleanup_runs` | **nothing** (no role but the owner): one row per guest-cleanup run, counts and durations only. Admins read it through `private.admin_cleanup_runs()` |
| `private.staff_grants` | **nothing** (no role but the owner): the admin's time-limited grants to read one user, room, or game, with the reason. Reached only through the `private.staff_*` functions |
| `private.qa_accounts` | **nothing** (RLS on, no policies, privileges revoked from every app role): dedicated QA identities. Reached only through the helpers below |
| `public.notices` | **nothing directly**: players read display-only fields through `private.active_notices()`; admins write through `private.admin_*notice*` functions |
| `private.notice_history` | **nothing** (RLS on, no policies): append-only post, edit, resolve, and sync history with the admin actor |

Supabase's default grants to `anon`/`authenticated` are revoked, including default privileges for future tables. **Every new table needs an explicit grant, `enable row level security`, policies, and a test in `supabase/tests/`.**

## Lobby functions

Lobby changes go through `security definer` functions so names, capacity, and the start/join race are settled in one place ([lobby](../../product-docs/features/lobby/feature-brief.md)).

| Function | Caller | Does |
|---|---|---|
| `create_room(name)` | `authenticated` (api) | Closes the caller's other open lobbies, picks a code without look-alikes, adds the host's membership with their name |
| `my_current_room()` | `authenticated` (api) | Security definer, filtered on `auth.uid()` only: the caller's room in a game, else a resume lobby for a game they played, else their lobby |
| `resume_game(game)` | `authenticated` (api) | Security definer. The game's host (`42501`) with host access (`SCH02`), an abandoned game within 30 days (`55000`); reuses the game's open resume lobby, else closes the host's open lobbies and creates one (`rooms.resume_game_id`) |
| `start_resumed_game(room)` | `game_engine` | Moves the game to the room, back `in_progress`; a non-Final clue left `active` becomes `unanswered`; Final not yet being revealed loses its wagers and goes back to `unplayed`; clears `resume_game_id` |
| `set_room_options(room, set_seasons, seasons, timers, double_round, max_players, quick_picks default null)` | `authenticated` (api, `PATCH /v1/rooms/{roomId}`) | Security definer (authenticated can't update `rooms`). Only the room's host (`42501`), only while `open` (`55000`); seasons non-empty and 1–40 (`22023`). A null argument leaves that option; `timers` is always written `standard`; `quick_picks` defaults to null so a 6-argument call still works |
| `join_room(code, name, role)` | `authenticated` (api) | Locks the room; refuses contestants unless `status = 'open'` and there is room (a playing host counts); suffixes a taken name ("Alice 2"); a member joining again keeps their name Resume (rejoin-games): in a resume lobby only that game's contestants (`SCH01` otherwise); in a game in progress, a contestant of that game takes their seat back, with the game's name |
| `set_member_name(room, user, name)` | `game_engine` | Lobby only; same suffix rule |
| `set_host_plays(room, plays)` | `game_engine` | Lobby only; the host joins or leaves the game on the host device |
| `leave_room(room, user)` | `game_engine` | Removes a non-host member |

- `room_members.display_name` is the name in that room; `profiles.display_name` is the last name used. `start_game()` snapshots the room name into `game_players`, and the room's game options (`timers`, `double_round`, `quick_picks`) onto `games`, so a game keeps the rules it started with; with `double_round` off it builds no Double board.
- A host with `rooms.host_plays` is recorded in `game_players` as a `contestant`, so they count for fresh boards and placement.
- Room codes are unique only among rooms that aren't closed (`rooms_live_code_idx`).

## Private access functions

Schema `private` holds functions the Data API doesn't expose, so calling them means going through a service ([private access](../../product-docs/features/private-access/feature-brief.md)).

| Function | Caller | Does |
|---|---|---|
| `private.redeem_host_code(code)` | `authenticated` (api, rate-limited) | Normalizes the code (case, spaces, dashes); advances the rotation if due; accepts the current code, or the previous one until its 5-minute grace ends; adds the caller to `hosts` (`on conflict do nothing`, so any number of callers can use one code and an existing host keeps their original row). `host_codes.used_at/used_by` are no longer written |
| `private.caller_is_host()` | `authenticated` (api) | Whether the caller can host |
| `private.user_is_host(user)` | `game_engine`; `create_room` and `start_game` | Whether a user can host. `create_room` and `start_game` raise `42501` without it |
| `private.new_host_code(note)` | owner only; the rotation functions | Creates a code row |
| `private.advance_host_code(at)` | owner only; every function below | Takes a transaction advisory lock and, if `rotates_at` has passed, makes one new code on the latest 45-minute boundary. The old code gets 5 minutes of grace only when exactly one window elapsed |
| `private.require_admin()` | owner only; every admin function | Raises `42501 not found` unless the caller is a non-anonymous account in `private.admins` |
| `private.admin_current_host_code()`, `admin_rotate_host_code(expected)`, `admin_hosts()`, `admin_set_host_note(user, note)`, `admin_remove_host(user)` | `authenticated` (api `/v1/admin/*`, as the caller) | Each calls `require_admin()` first. Rotate replaces the code only if `expected` is still current (so two admins make one new code) and gives the old code no grace. Hosts are newest first, with email for accounts and the last display name for guests. Notes are trimmed, empty means none, at most 200 characters |
| `private.my_stats()` | `authenticated` (api `/v1/me/stats`) | Security definer so one caller's counted games can be aggregated from the shared result rows. Returns only that caller's totals and leaderboard state; guests are refused |
| `private.leaderboard()` | `authenticated` (api `/v1/leaderboard`) | Security definer because ranking compares every eligible account and checks `auth.users.is_anonymous`. Returns the top 50 plus the caller when below them, with only rank, account name, win rate, wins, games, and `isMe`—never user IDs or emails. Guests and callers without a counted game are refused |
| `private.is_qa(user)` | internal only | Whether an account is a dedicated QA identity. Ranking and cleanup use it; no app role can call it directly |
| `private.admin_mark_qa(user, role, label)` | `authenticated` (api `POST /v1/admin/qa-accounts`) | Admins only. Marks the account, sets its account name and leaderboard preference, and gives the QA host permanent host access |
| `private.admin_qa_cleanup(age, dry_run)` | `authenticated` (api `POST /v1/admin/qa-cleanup`) | Admins only. Previews or deletes old rooms and games belonging only to QA accounts, plus those accounts' seen clues for deleted games. Any non-QA participant makes the row ineligible |
| `private.active_notices(at)` | `authenticated` (api `GET /v1/notices`) | Display-only active notices in Incident, Maintenance, What's new order, evaluated on the server clock |
| `private.admin_post_notice`, `admin_edit_notice`, `admin_resolve_notice`, `admin_set_notice_sync`, `admin_notices` | `authenticated` (api `/v1/admin/notices*`) | Admins only. Validate lifecycle changes, increment revisions on edits/resolution, and append `notice_history` plus the security audit |

## Account functions

Accounts ([accounts](../../product-docs/features/accounts/feature-brief.md)): players sign in with email and password, and every sign-in moves the device's guest into the account. All four are `security definer` in schema `private`, granted to `authenticated`, and called by api (`api/internal/account`; the three that change state are rate-limited). A caller is a guest if either the token's `is_anonymous` or `auth.users.is_anonymous` says so.

| Function | Does |
|---|---|
| `private.set_account_name(name)` | Signed-in callers only (`42501`). Sets `profiles.account_name` (1–20 characters, `22023`), creating the profile if needed. Players can't write `account_name` directly |
| `private.create_merge_ticket()` | Guests only (`42501`). Replaces the guest's earlier tickets with a new one, valid 24 h |
| `private.merge_guest(ticket)` | Signed-in callers only (`42501`). Spends the ticket (`22023` if wrong, used, expired, or not a guest's); refuses while the guest is in an `in_game` room (`55006`, the ticket stays valid). Then moves the guest into the caller, below, and deletes the guest from `auth.users` |
| `private.delete_account()` | Signed-in callers only (`42501`); refused while in an `in_game` room (`55006`). Deletes the caller from `auth.users`; the cascades below do the rest |
| `private.admin_delete_account(user)` | Admins only (`require_admin()`, `42501`). The same deletion for any user, on request ([operator-scripts.md](../operations/operator-scripts.md)); `22023` if there is no such user, `55006` while in an `in_game` room. Run from the SQL editor with the admin's claims set; no api route calls it |

Merging a guest into an account:

- `game_players`: the guest's rows move to the account, except in a game both were in; there the guest's row becomes "Former player" (`user_id` and `display_name` null).
- `games.host_user_id` and `host_codes.used_by` follow the guest to the account.
- `seen_clues`: merged; a clue both saw keeps the later `seen_at`.
- `hosts`: either one's host access is enough.
- Everything else the guest had (profile, memberships, lobbies it hosted) goes with the deleted guest.

`profiles.display_name` is the last name used in a room; `profiles.account_name` is the signed-in player's own name (leaderboard, name prefill), null for guests.
`profiles.show_on_leaderboard` is on by default. Turning it off removes the account from ranking immediately without changing its private stats.

## Audit log and staff access

`private.audit_log` is append-only: `id`, `at`, `actor`, `action`, `subject_type` (`user`, `room`, `game`, `system`), `subject_id`, `request_id`, `details` (counts, flags and ids; never emails, passwords, tokens, or a grant's reason). `action` is checked against the list below. No app role can read, update, or delete rows, and only the owner can; `supabase/tests/audit_and_staff_access.test.sql` proves it.

| Function | Called by | Does |
|---|---|---|
| `private.audit(action, subject_type, subject_id, details, actor)` | the functions and trigger below; `game_engine` (trusted jobs, such as data retention's guest cleanup) | Inserts one row. The actor is `auth.uid()`, else the `actor` argument. The request id is `request.id`, which `golib/db` sets in every `AsUser`/`AsEngine` transaction from the api's `X-Request-Id`. A failed insert never fails the caller: it raises a `WARNING` `audit write failed: action=… sqlstate=… request_id=…`, which `golib/db` logs as `ERROR` "audit write failed" |
| `private.audit_trigger_auth_users()` | triggers `audit_account_created` (after insert) and `audit_account_updated` (after update of `is_anonymous`, `encrypted_password`) on `auth.users` | `account_created` for a new non-anonymous user or a guest becoming an account (actor: that user); `password_changed` when the password hash changes (actor: `auth.uid()`, or none with `details.via` = the role that ran the change, such as `postgres` from the SQL editor or `supabase_auth_admin`). Any error becomes the same warning, so sign-up, sign-in and password changes never fail because of it |
| `private.staff_grant(type, id, reason, minutes)` | `authenticated` (api `POST /v1/admin/staff-access`) | Admins only. Checks the type, that the subject exists, a 1–200 character reason, and 1–480 minutes (default 60) (`22023`). Records the grant and audits `staff_access_granted` (grant id and minutes, not the reason) |
| `private.staff_read(grant)` | `authenticated` (api `GET /v1/admin/staff-access/{id}`) | Admins only. Refuses (`28000`) a grant that isn't the caller's, has expired, or was revoked. Returns the subject as fixed JSON (`StaffSubject` in `shared/openapi.yaml`): a user's profile, flags, rooms, games with scores, host access and seen-clue count; a room's options and members; a game's players, board and answers with verdicts. Never emails, password hashes, or tokens. Audits `staff_read` with the grant id |
| `private.staff_revoke(grant)` | `authenticated` (api `DELETE /v1/admin/staff-access/{id}`) | Admins only, own grants only (`28000`). Ends an active grant and audits `staff_access_revoked`; an inactive one is left as it is |
| `private.admin_audit(since, action, subject)` | `authenticated` (api `GET /v1/admin/audit`) | Admins only. Newest first, at most 500, each filter optional |

Rows are written for:

| Action | Written by |
|---|---|
| `host_access_granted` | `redeem_host_code`, only when it adds the caller to `hosts` |
| `host_access_removed` | `admin_remove_host`, only when a row was removed |
| `host_code_rotated` | `admin_rotate_host_code`, only when it replaced the code (subject `system`, no code values) |
| `account_created`, `password_changed` | the `auth.users` triggers |
| `guest_merged` | `merge_guest` (subject: the account; `details.games_added`) |
| `account_deleted` | `delete_account` (`details.by = 'self'`) and `admin_delete_account` (`'admin'`) |
| `guests_deleted` | `delete_unused_guests`, once per run (subject `system`, `details.count`) |
| `staff_access_granted`, `staff_read`, `staff_access_revoked` | the `staff_*` functions |
| `qa_account_marked` | `admin_mark_qa`, once per marked account (subject: that account; role only in details) |
| `qa_cleanup` | `admin_qa_cleanup`, once per preview or apply (subject `system`; dry-run flag and room/game counts) |
| `notice_posted`, `notice_edited`, `notice_resolved`, `notice_synced` | the `admin_*notice*` functions (subject: the notice; display content is kept in notice history, not audit details) |

## Guest cleanup

Guests unused for 90 days are deleted daily ([data-retention.md](../operations/data-retention.md#guest-cleanup)). `pg_cron` (extension in `pg_catalog`, jobs in schema `cron`) runs job `delete-unused-guests` at 04:17 UTC as the owner. All the functions are security definer in `private`.

| Function | Called by | Does |
|---|---|---|
| `private.guest_last_used(user)` | the functions below | The latest of `auth.users.created_at`, `last_sign_in_at`, the newest `auth.sessions` refresh, room joins, game joins, and games hosted |
| `private.user_is_active(user)` | the functions below | Whether the user is in a room that isn't closed, or in a game in progress as a player or host |
| `private.eligible_guests(cutoff, max)` | `delete_unused_guests` | Anonymous users last used before `cutoff` and not active, oldest first |
| `private.delete_unused_guests(cutoff = now() - 90 days)` | `pg_cron` only (no app role may execute it) | Deletes eligible guests with the deletion rule (`delete from auth.users`), checking eligibility again in the delete, in batches of 500, at most 20 per run. Records a `cleanup_runs` row and a `guests_deleted` audit row; a failure records the error and deletes nothing |
| `private.admin_cleanup_runs()` | `authenticated` (api `GET /v1/admin/cleanup-runs`) | Admins only. The last 30 runs |

## History outlives rooms and accounts

- Deleting a room keeps its games (`games.room_id` becomes null).
- Each game records who hosted it (`games.host_user_id`, set by `start_game()`), so "Hosted by" in My games survives a deleted room. Deleting the host's account nulls it.
- Deleting an account (`private.delete_account()`) deletes its `seen_clues` and host access, nulls its name snapshots, and nulls `game_players.user_id`. Its results stay on other players' scoreboards as "Former player".
- Scores are never stored: `game_results` sums each player's `answers.score_delta`, so an override can't leave a stale total.
- Each answer also keeps why it was judged: `match_rule` (`exact`, `spelling_slip`, `sounds_alike`, `no_match`, `nothing_heard`), `heard` (every transcript, most likely first; at most 5), and `judge_verdict` (`correct` or `incorrect`), none of which an override changes; `overridden_at` is the last host override. All four are null for answers recorded before 2026-11-10. Game members read them like the rest of the row. Tuning: [judge-tuning.md](../operations/judge-tuning.md).

## Migration rules

- SQL files in `supabase/migrations/`, created with `supabase migration new {name}`. No other tool writes the schema.
- Compatible with the code already running: add columns nullable or with defaults; drop or rename only in a later release, after no deployed code uses the old shape.
- Enum values must match `shared/schemas/domain.schema.json`. Adding one means changing both in the same PR.
- Rehearsed on staging before every release.
