# Data and Isolation

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
| `rooms` | read if host or member; create as host; host updates status/size |
| `room_members` | read fellow members; leave (non-host); join only via `join_room(code)` |
| `board_clues`, `games`, `game_players`, `answers`, `game_results` (view) | read if they played or watched that game (`is_game_member`); no writes |
| `seen_clues` | **nothing**: only used to build boards |

Supabase's default grants to `anon`/`authenticated` are revoked, including default privileges for future tables. **Every new table needs an explicit grant, `enable row level security`, policies, and a test in `supabase/tests/`.**

## History outlives rooms and accounts

- Deleting a room keeps its games (`games.room_id` becomes null).
- Deleting an account deletes its `seen_clues`, nulls its name snapshots, and nulls `game_players.user_id`. Its results stay on other players' scoreboards as "Former player".
- Scores are never stored: `game_results` sums each player's `answers.score_delta`, so an override can't leave a stale total.

## Migration rules

- SQL files in `supabase/migrations/`, created with `supabase migration new {name}`. No other tool writes the schema.
- Compatible with the code already running: add columns nullable or with defaults; drop or rename only in a later release, after no deployed code uses the old shape.
- Enum values must match `shared/schemas/domain.schema.json`. Adding one means changing both in the same PR.
- Rehearsed on staging before every release.
