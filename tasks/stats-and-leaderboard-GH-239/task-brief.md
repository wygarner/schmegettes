---
task-type: new-feature
task-title: "Stats and leaderboard for signed-in players"
---
# Task spec: stats-and-leaderboard

Product brief: `tasks/stats-and-leaderboard/product-brief.md`. Product docs: `docs/product-docs/features/stats-and-leaderboard/feature-brief.md` and `interaction-design.md` (rules, states, edge cases).

## Approach

Stats are computed **on read** from the same rows every scoreboard uses: `game_players`, `games`, `answers`, `board_clues`, and the `game_results` view. There's no cache and no materialized view, so "within a minute" is met trivially and an override or account deletion shows up at once. The data is small: a heavy player has hundreds of games.

All the rules live in two SQL functions in `private` (security definer, `search_path = ''`, granted to `authenticated`), following the `private.*` pattern the account functions use:

- `private.my_stats()`: the caller's stats as one row. It raises `not-signed-in` (`42501`, message `not signed in`) for a guest.
- `private.leaderboard()`: the top 50 plus the caller's own row, with no user IDs in the output. It raises `not-signed-in` for a guest and `no-counted-games` (`P0001`, message `no counted games`) for an account with none.

The api is a thin pass-through (`db.AsUser`). The web adds `/stats` and `/stats/leaderboard`, a Home link and the Account toggle.

**Definitions**, from the feature brief, applied in SQL:

- **Counted game:** `games.status = 'finished'` and the caller's `game_players.role = 'contestant'`. A playing host is recorded as a contestant at Start, so it counts. A player who left mid-game counts: `left_at` doesn't matter.
- **Win:** `game_results.placement = 1` for the counted game. `rank()` already gives shared 1st to everyone tied.
- **Scores:** `game_results.score` per counted game. Average is `round(avg)`. Best links to the game with the highest score; ties go to the most recent. Career total is the sum and can be negative.
- **Right** is a verdict in (`correct`, `overridden_correct`); **wrong** is in (`incorrect`, `overridden_incorrect`); `appeal_pending` is excluded.
  - **Correct answers:** right ÷ (right + wrong) over answers on `board_clues.round in ('single','double')`, counted games only.
  - **Daily Doubles:** right–wrong over answers on `board_clues.is_daily_double`.
  - **Final Schmegettes:** right–wrong over answers on `round = 'final'`. Only finalists have Final answers, so "only as a finalist" follows.
- **Win rate:** `floor(100 * wins / games)` as an integer percent. Rank and tie-breaks use the exact ratio (`wins::numeric / games`), not the rounded percent.
- **On the leaderboard:** `auth.users.is_anonymous = false`, `profiles.account_name is not null`, `profiles.show_on_leaderboard`, and at least 10 counted games. Rank is `rank() over (order by win_ratio desc, wins desc, games desc)`, so a full tie shares a rank and the next rank skips.
- **Who may read it:** a signed-in caller with at least one counted game.
- **Same person as guest and account in one game:** the guest's row is "Former player" (`user_id` null after a merge or delete), so it's never the account's. Nothing extra is needed.
- **Deleted account:** `profiles` cascades away, so the account leaves the leaderboard at once.

## Subtasks (narrow → wide)

1. **shared** (contract change, additive):
   - `shared/openapi.yaml`:
     - `GET /v1/me/stats` → `MyStats`. A guest gets 403 `not-signed-in`. An account with no counted games gets `200` with `games: 0` and every other field null, so the web shows "Play a game…".
     - `GET /v1/leaderboard` → `Leaderboard`. A guest gets 403 `not-signed-in`; an account with no counted games gets 403 `no-counted-games`.
     - `PATCH /v1/me`: optional `showOnLeaderboard: boolean`. `accountName` becomes optional, with at least one property required (`minProperties: 1`).
     - `Profile`: add `showOnLeaderboard: boolean`.
     - `MyStats`: `games`, `wins`, `winRate` (int percent), `averageScore`, `bestScore`, `bestGameId` (uuid), `careerTotal`, `correct` `{right, judged}`, `dailyDoubles` `{right, wrong}`, `final` `{right, wrong}`, and `leaderboard`, a union of `{state: "ranked", rank}`, `{state: "needs-games", gamesToGo}` and `{state: "hidden"}`. Every number except `games` is nullable when `games = 0`.
     - `Leaderboard`: `rows: [{rank, name, winRate, wins, games, isMe}]` (at most 50), and `me` (nullable, the same shape) when the caller is ranked below 50. Plus `myState` (`ranked` | `needs-games` | `hidden`) and `gamesToGo` when it's `needs-games`. **No user IDs anywhere.**
     - New problem type `no-counted-games`.
   - Run `mise run gen` and commit the output.
2. **supabase**: `supabase migration new stats_and_leaderboard`
   - `alter table public.profiles add column show_on_leaderboard boolean not null default true;`
   - `grant update (show_on_leaderboard) on public.profiles to authenticated;` The existing owner-only update policy on `profiles` limits it to the caller's own row; confirm that policy and re-state it if it's column-bound.
   - `private.counted_games(target uuid)`: an internal helper, `stable`, not granted to anyone. It returns `(game_id, score, placement, finished_at)` for the target's counted games. Both functions below use it.
   - `private.my_stats()` and `private.leaderboard()` as in Approach. Both are security definer (they read other players' results and `auth.users.is_anonymous`), `stable`, `set search_path = ''`, and `revoke all … from public, anon; grant execute … to authenticated`.
   - Indexes, if the plan needs them: `answers (game_player_id)` and `game_players (user_id)` already exist. Add `games (status)` only if `explain` on a 1,000-game seed shows a sequential scan that matters. Note the result in the PR.
   - pgTAP `supabase/tests/stats_and_leaderboard.test.sql`. Seed one account with hand-counted games:
     - a solo win, a shared 1st, a 2nd;
     - an answer overridden to correct, and one overridden to incorrect;
     - an `appeal_pending` answer (excluded);
     - a Daily Double right and a Daily Double wrong;
     - a Final as finalist;
     - an abandoned game and a watched game (both excluded);
     - a game where the caller left mid-game (counted).
     
     Assert every `my_stats()` field against those numbers. Then:
     - a player with 9 counted games isn't ranked; the 10th makes them ranked;
     - tie-breaks: wins, then games, then a shared rank with the next rank skipped;
     - `show_on_leaderboard = false` removes the player at once;
     - deleting the account removes them;
     - a guest and an account with no counted games are refused (`throws_ok`);
     - the output has no user ID column (`has_column`/`col_type` checks on the result set, or `results_eq` on the exact column list);
     - `anon` can't execute either function.
   - Compatible with running code: one new column with a default, and new functions only.
3. **api** (`api/internal/account`, plus a new `api/internal/stats` package, or in `games` if it reads better):
   - `GET /v1/me/stats` → `select * from private.my_stats()` with `db.AsUser`.
   - `GET /v1/leaderboard` → `private.leaderboard()`.
   - Map `not signed in` to 403 `not-signed-in` and `no counted games` to 403 `no-counted-games`, using the account package's existing error mapping.
   - `PATCH /v1/me`: accept `showOnLeaderboard`, as `update public.profiles set show_on_leaderboard = $1 where user_id = auth.uid()`. Guests get 403 `not-signed-in`, like `accountName`.
   - `GET /v1/me` returns `showOnLeaderboard`.
   - Routes go behind `Authenticate`, with no new rate limit; the `security-audit-and-staff-access` task adds per-route limits for every route later.
   - Handler tests validate responses against the generated OpenAPI 3.0 copy, as the existing tests do. Store tests follow `store_test.go`.
4. **web**:
   - `web/src/App.tsx`: routes `/stats` and `/stats/leaderboard`.
   - `web/src/pages/Stats.tsx`, with two tabs that are links, so each tab has its own URL:
     - **You:** the three groups as in the interaction design. Best score links to `/games/{bestGameId}`. Then the leaderboard line: "Ranked #4", "Play 7 more games to get on the leaderboard.", or "You're hidden from the leaderboard."
     - **Leaderboard:** rows with rank, name, win rate, wins and games. My row is highlighted with "(you)" and, if I'm below 50, pinned below a separator. At the bottom go the needs-games or hidden lines.
     - Guest: "Sign in to see your stats and the leaderboard." with **Sign in**, using the sign-in entry the accounts feature already has.
     - Empty states, and "Couldn't load stats. Try again." with **Retry**.
     - Phone-only layout like My games, never in a room or on the TV.
   - `web/src/pages/Home.tsx`: **Stats** next to My games.
   - `web/src/pages/Account.tsx`: a **Show me on the leaderboard** switch (default on). It saves at once through `PATCH /v1/me` and rolls back on failure with the existing error treatment.
   - API helpers next to the existing `web/src/lib/account.ts` and `games.ts`.
5. **docs**:
   - `docs/system-docs/architecture/data-and-isolation.md`: add `profiles.show_on_leaderboard`, `private.my_stats` and `private.leaderboard` to the functions table, noting why they're security definer and what they never return.
   - `docs/system-docs/architecture/api-contract.md`, if it lists routes.
   - The `game-history` feature brief already links here; nothing else.

## Key files

`shared/openapi.yaml` (+ generated), `supabase/migrations/<new>_stats_and_leaderboard.sql`, `supabase/tests/stats_and_leaderboard.test.sql`, `api/internal/account/{handler,store}.go` (+ tests), `api/internal/stats/` (new) or `api/internal/games/`, `api/cmd/api/main.go` (routes), `web/src/App.tsx`, `web/src/pages/{Stats,Home,Account}.tsx` (+ tests), `web/src/lib/account.ts`, `docs/system-docs/architecture/data-and-isolation.md`.

## Contracts preserved

**Changes (additive):**
- `GET /v1/me/stats` and `GET /v1/leaderboard`;
- `Profile.showOnLeaderboard`;
- `PATCH /v1/me` gains `showOnLeaderboard`, and `accountName` becomes optional. Existing clients always send `accountName`, so they're unaffected.
- the problem type `no-counted-games`.

No WebSocket or game-server change.

## Success criteria

The product brief's criteria, in particular:
- every stat matches the hand-counted pgTAP seed;
- 9 games → not ranked, and 10 → ranked as soon as the game finishes;
- tie-breaks;
- hiding and deleting remove the player at once;
- guests and players with no counted games are refused in both the UI and the API;
- the leaderboard response contains only rank, name, win rate, wins, games, and an `isMe` flag (no IDs or emails), checked by an api handler test that inspects the JSON keys.

## Test plan

- `mise run db:test` (`stats_and_leaderboard.test.sql`)
- `mise run test:api -- ./internal/account/... ./internal/stats/...`
- `mise run test:web -- src/pages/Stats.test.tsx src/pages/Home.test.tsx src/pages/Account.test.tsx`. Cover each state in the interaction design's table, the pinned "(you)" row, the Retry state, and the Account switch's optimistic update and rollback.
- Manual (staging): two accounts play 10 games; the leaderboard appears for both, hiding works, and a rename shows at once.

## Database migration plan

- File: `supabase migration new stats_and_leaderboard`.
- `profiles.show_on_leaderboard` (boolean, not null, default true), with a column grant for update to `authenticated`, own row only (existing policy).
- Functions `private.counted_games` (internal), `private.my_stats` and `private.leaderboard`: security definer, `stable`, `search_path = ''`, executable by `authenticated` only (except `counted_games`, which nobody can execute).
- No new table, so no new RLS policy. pgTAP as above.
- Compatible with the code already running: an additive column, and new functions.

## Logging requirements

- api: the existing request log line covers both routes. Add nothing that logs names or stats values.
- The `PATCH /v1/me` leaderboard toggle logs `info` "leaderboard visibility changed" with `user_id` and `shown`. No names or emails.

## Docs to update

As in subtask 5.

## Branch
`new-feature/GH-239-stats-and-leaderboard`, from and into `develop`
