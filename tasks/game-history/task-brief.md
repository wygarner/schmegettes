---
jira-type: new-feature
jira-title: "Fresh boards: never repeat a clue, backed by durable game history"
---
# Task spec: game-history

Product brief: `tasks/game-history/product-brief.md`. Rules: `docs/product-docs/features/game-history/`.

No Jira ticket. Jira is not configured yet and the human chose to skip tickets for this task.

## Approach

All recording and board-building logic lives in Postgres functions that the game server calls as `game_engine`. Each function is one transaction and safe to retry. The game server, API and web app don't exist yet (`game/` returns 501 on the socket and `api/` is not generated), so wiring them up is deferred to the tasks that build them (see "Follow-up work"). Everything here is proven with pgTAP.

The board is built inside `start_game()` in SQL, not by the worker through the `build_board` job:
- It has to finish in under 3 s while players watch, and a queue round trip adds polling delay.
- It must happen in the same transaction that records the game's players, so the board matches exactly the people it was built for.
- Nothing produces or consumes `build_board` yet, so it is removed.

The init migration is **edited in place** (human decision). It has never been applied to a live database. Anyone with a local database runs `mise run db:reset` afterwards.

## Subtasks

### 1. `shared/` contracts

| File | Change |
|---|---|
| `shared/schemas/domain.schema.json` | Add `GameStatus` enum: `in_progress`, `finished`, `abandoned`. Add `building_board` to `GamePhase` (after `lobby`). |
| `shared/schemas/jobs/job.schema.json` | Remove `BuildBoard` from `oneOf` and `$defs`. |
| `shared/openapi.yaml` | See "Contracts" below. |
| `shared/test/schemas.test.ts` | Cover the new enum value and the removed job kind. |
| `shared/generated/ts/*` | Regenerate. |

Run `bun run --cwd shared gen:ts`. Go and Python output doesn't exist yet (it comes with `scaffold-services`), and this machine has neither Go nor uv. If the implementation machine has them, run `mise run gen` instead and commit all output.

### 2. `supabase/`: fix `20261026000000_init.sql` in place

**Enums:** add `game_status` mirroring `GameStatus`.

**`clues`:** add
```sql
category_key text generated always as (
  md5(season::text || '|' || coalesce(air_date::text, '') || '|' || round::text || '|' || category)
) stored
```
plus an index on `(round, category_key)`. A category is one category from one aired game.

**`rooms`:** add `seasons integer[]` (null means all seasons). This is the host's season choice, used when the board is built at Start.

**`games`:**
- `room_id` becomes nullable, `on delete set null`
- add `status game_status not null default 'in_progress'`
- `finished_at` means "ended" (finished or abandoned)

**`game_players`:** one row per person in a game, including spectators.
- `id uuid primary key default gen_random_uuid()`
- `game_id` (cascade with the game)
- `user_id uuid null references profiles on delete set null`
- `role player_role not null`
- `display_name text` (snapshot at join; null after the account is deleted)
- `joined_at timestamptz not null default now()`
- `left_at timestamptz`
- `unique (game_id, user_id)`
- **Drop** `final_score` and `placement`. Scores come from the `game_results` view.

**`board_clues`:**
- now belongs to a **game**: replace `room_id` with `game_id uuid not null references games on delete cascade`
- unique `(game_id, round, column_index, row_index)`
- add `revealed_at timestamptz`
- `value` is the standard value by row: 200 to 1000 in single, 400 to 2000 in double, 0 in final. It is not the catalog's era-specific value.

**`answers`:**
- replace `user_id` with `game_player_id uuid not null references game_players on delete cascade`
- `id` is supplied by the caller, so retries are no-ops

**New `seen_clues`:**
- `user_id uuid references profiles on delete cascade`
- `clue_id uuid references clues on delete cascade`
- `seen_at timestamptz not null`
- `game_id uuid references games on delete set null`
- primary key `(user_id, clue_id)`
- re-seeing keeps the latest `seen_at`

**New view `game_results`** (`with (security_invoker = true)`): one row per `game_players` row with:
- `game_id`, `game_player_id`, `role`
- `display_name`: `coalesce(display_name, 'Former player')`, or `'Former player'` when `user_id` is null
- `score`: sum of `answers.score_delta`, 0 if none
- `placement`: `rank()` over contestants and host by score, descending, so ties share a place; null for spectators

**Profile deletion:** a `before delete` trigger on `profiles` nulls `display_name` in that user's `game_players` rows. The FK then nulls `user_id`.

**Functions.** All are `security invoker`, `set search_path = ''`, executable by `game_engine` only, and safe to call twice:

| Function | Does |
|---|---|
| `start_game(room uuid) returns uuid` | Locks the room. If it is not `open`, raises `'room not open'` (55000). Inserts a `games` row, one `game_players` row per current `room_members` row (role and `display_name` from `profiles`), calls `build_board`, and sets the room to `in_game`. All in one transaction: if the board can't be built, nothing is kept. |
| `build_board(game uuid)` (internal; called only by `start_game`) | Contestants are the game's `host` and `contestant` players. Takes 6 single categories and 6 double categories that each have exactly 5 clues, plus 1 final category with 1 clue. Only uses `rooms.seasons` when set. **Eligible** categories have no clue in the contestants' `seen_clues`; pick them at random. If too few, fill from the rest ordered by (number of contestants who saw any clue in it, ascending; newest `seen_at`, ascending; random). Raises `'catalog too small'` (P0001) only if the catalog itself can't fill a board. Places 1 Daily Double in single and 2 in double, at random rows 1 to 4, in different columns. Rows follow catalog value order within the category. |
| `reveal_clue(board_clue uuid)` | Sets `revealed_at` if null and the clue state to `active`. Upserts `seen_clues` for every player in the game with a non-null `user_id` and null `left_at`, any role, keeping the greater `seen_at`. A second call changes nothing. |
| `record_answer(id uuid, board_clue uuid, user uuid, answer text, source answer_source, verdict verdict, score_delta int)` | Inserts the answer, resolving `game_player_id` from `(game of board_clue, user)`. Conflict on `id` does nothing. |
| `update_verdict(answer uuid, verdict verdict, score_delta int)` | Host override and appeal result. Updates both columns. |
| `player_left(game uuid, user uuid)` | Sets `left_at` if null. |
| `end_game(game uuid, status game_status)` | Only `finished` or `abandoned`. Only changes an `in_progress` game: sets `status` and `finished_at = now()`, and sets the room back to `open` for a rematch. Calls on an ended game do nothing. |

**Membership helper:** `public.is_game_member(target_game uuid)`, a `security definer` function that checks for a `game_players` row with `user_id = auth.uid()`.

**RLS and grants** (replacing the room-based game policies):

| Object | `authenticated` | `game_engine` |
|---|---|---|
| `games`, `game_players`, `answers`, `board_clues` | select where `is_game_member(game_id)` (`id` for `games`) | select, insert, update (no delete) |
| `game_results` | select (RLS of the base tables applies) | select |
| `seen_clues` | **nothing** | select, insert, update |
| `rooms.seasons` | host may update (add to the column grant) | — |

Execute grants on the functions go to `game_engine` only. Revoke from `public`.

**`seed.sql`:** keep the 4 named clues. Add synthetic catalog rows with `generate_series` so `start_game` works locally for a few games: 20 single categories × 5, 20 double × 5 and 4 final × 1, `source_key` prefixed `seed-gen-`.

### 3. `game/`, `api/`, `worker/`, `web/`

No code changes in this task (see "Follow-up work"). The worker has no `build_board` handler to remove.

### 4. Docs

| File | Update |
|---|---|
| `docs/system-docs/architecture/system-overview.md` | Steps 2 and 3: the room stores seasons and the board is built at Start by `start_game()`. Step 7: recording happens throughout the game. Update the "Who owns what" table. |
| `docs/system-docs/architecture/data-and-isolation.md` | Policy table: game data is visible to game members, not room members; `seen_clues` is not visible to users; deletes keep history. |
| `docs/system-docs/architecture/realtime-game-server.md` | New "Recording" section: which function the state machine calls at Start, reveal, judge, override, leave and end. Retries are safe. Phase `building_board`. |
| `docs/product-docs/architecture/product-overview.md` | Add `building_board` to the phase list. |

## Contracts

These are changes, made deliberately. No consumer exists yet: nothing has been generated for Go or Python, `api/` doesn't exist, and `web/` and `devtools/` don't reference any of these. Changing required fields therefore breaks nothing and needs no `/v2`.

- **domain:** `GameStatus` is new. `GamePhase` gains `building_board`, which is additive.
- **jobs:** `build_board` is removed.
- **openapi:**
  - `POST /v1/rooms`: response description changes from "Room created; board is built asynchronously" to "Room created".
  - `Room`: `boardReady` is removed and `seasons` (`integer[] | null`) is added.
  - `PATCH /v1/rooms/{roomId}` is new, host only, with `{ seasons, maxPlayers }`, for choosing seasons before Start. The handler is built by the api follow-up.
  - `GET /v1/games`: summary changes to "The caller's ended games (finished or abandoned), newest first".
  - `GameSummary`: becomes `{ gameId, status, startedAt, finishedAt, score, placement (integer|null), players: string[] (display names, "Former player" for deleted accounts), playerCount }`, replacing `finalScore`.
  - `GET /v1/games/{gameId}` is new. It returns a `GameDetail` (`gameId, status, startedAt, finishedAt, results: [{ displayName, role, score, placement }]`, contestants ordered by placement, spectators excluded). It returns 404 to anyone who isn't a member of that game.
- **WebSocket protocol:** unchanged. `phase_changed` already carries any `GamePhase`.

## Success criteria

The product brief's criteria, proven at the database layer:

1. Two games run back to back with the same players share no revealed clue, and game 2's board has no category containing a clue revealed in game 1.
2. A player who saw clues with group A gets none of those categories when playing with group B.
3. Clues left unplayed on a board are not seen; the next board may use them.
4. A spectator's revealed clues are recorded but don't limit the board of the game they watch.
5. When the catalog is short, `start_game` still returns a full board and prefers categories nobody has seen, then categories seen longest ago.
6. A game ended as `abandoned` keeps its scores, and its revealed clues count as seen.
7. A player who leaves the room, or whose room was deleted, can still read that game and its `game_results`. Players outside the game can't.
8. Renaming a profile doesn't change `game_results.display_name`. Deleting a user leaves a "Former player" row with their score, and their `seen_clues` are gone.
9. `game_results.score` equals the sum of `score_delta` after `update_verdict`. Tied scores share a placement.
10. Calling `reveal_clue` twice, `record_answer` twice with the same id, `player_left` twice, or `end_game` twice leaves the same state as calling once. A second `start_game` on a room already in a game raises `'room not open'` and changes nothing.
11. Users can't read `seen_clues` or `clues`, and can't call any engine function.
12. `start_game` takes under 3 s with a full-size catalog (see the test plan).

## Test plan

**`supabase/tests/game_history.test.sql`** (new, pgTAP) covers criteria 1 to 11. Set up a small synthetic catalog in the test (about 15 single, 15 double and 3 final categories), act as `game_engine` with `set local role game_engine`, and read as users with `set local role authenticated` plus `request.jwt.claims`, as in `rls.test.sql`.

**`supabase/tests/rls.test.sql`:** update for the changed policies. `board_clues`, `games` and the rest are now visible through game membership. Keep every existing assertion that still applies.

**Commands:**
```bash
mise run db:reset
mise run db:test
bun test --cwd shared        # schema tests
```

**Performance check** (by hand, results in the PR description): in a local database, insert about 400k synthetic clues (about 80k categories) and 6 users with 5,000 `seen_clues` each. Run `explain analyze select public.start_game(...)` as `game_engine` and record the time. It must be under 3 s. If it isn't, add a `catalog_categories` table maintained by the import and say so in the PR.

## Database migration plan

- **File:** edit `supabase/migrations/20261026000000_init.sql` in place, as the human decided. It has never been applied to staging or production, and no hosting exists. No new migration file.
- **Tables:** `seen_clues` is new; `games`, `game_players`, `board_clues`, `answers`, `rooms` and `clues` change as in subtask 2; the `game_results` view is new.
- **RLS:** enabled on `seen_clues`, which has no `authenticated` grant. Every policy is listed above.
- **Tests:** `game_history.test.sql` is new and `rls.test.sql` is updated.
- **Compatibility:** no running code reads these tables. After this lands, anyone with a local database must run `mise run db:reset`; say so in the PR.

## Logging requirements

This task adds no log lines: it is SQL and contracts only. The follow-up tasks must log:

| Event | Level | Fields |
|---|---|---|
| `game started` | info | `room_id`, `game_id`, `player_count`, `duration_ms` (including the board build) |
| `board build failed` | error | `room_id`, `err` |
| `game ended` | info | `room_id`, `game_id`, `status` |
| `recording failed` (any engine function) | error | `room_id`, `game_id`, `err`, function name |

Never log clue text, correct responses, typed answers (except at `debug`), tokens or emails.

## Follow-up work (separate tasks; requirements recorded in the docs above)

1. **First gameplay task (`game/`):** call the engine functions from the state machine, send `building_board` and the lobby error "Couldn't build a board. Try again.", and close joining at Start.
2. **After `scaffold-services` (`api/`):** `PATCH /v1/rooms/{id}`, `GET /v1/games` and `GET /v1/games/{id}`, reading through `Db.as_user` and `game_results`.
3. **`web/`:** the "My games" list and the game scoreboard screen, per `interaction-design.md`.
4. **Anonymous-account cleanup**, whenever it is decided, must follow the deletion rule. The profile trigger already handles the data side.

## Branch
`new-feature/game-history-db`, from and into `daily/YYYY-MM-DD` (today's daily branch when work starts). There is no Jira key, so the branch has no `SCH-{N}`. The PR title is `[New Feature] game-history: fresh boards and durable game history (database)`. Its final commit deletes `tasks/game-history/`.
