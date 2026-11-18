---
jira-type: enhancement
jira-title: "Game options in the lobby: seasons, timers, Double Schmegettes on/off"
---
# Task spec: lobby-game-options

Product brief: `tasks/lobby-game-options/product-brief.md`. Rules: `docs/product-docs/features/lobby/feature-brief.md#game-options` and `interaction-design.md` (Game options sheet), gameplay (buzz and answer windows; rounds), wagers (who plays Final).

## Approach

Options live on the **room** (set in the lobby, kept for a rematch) and are **copied onto the game** at Start, so a game's rules never change under it and a resumed game (`rejoin-games`) keeps them. `game/` reads them from the game row, both at Start and when it recovers a game.

- **Seasons** already exist (`rooms.seasons`, passed to `build_board_round`). The API declares `PATCH /v1/rooms/{roomId}` but has no handler, and direct `update` on `rooms` was revoked on purpose (lobby migration). So settings change through a new SQL function, like every other room write.
- **Timers**: a `timer_pace` enum (`relaxed`, `standard`, `fast`). `game/` maps it to durations: buzz window 15 / 9 / 5 s, answer window 12 / 9 / 7 s. Wager and Final timers, the reading, the lockout and the answer grace are unchanged.
- **Double Schmegettes**: `double_round boolean`. Off: `start_game` doesn't build the Double board, and `play.Game` goes from the last Single clue straight to Final. This must be an explicit flag: `roundDone(RoundDouble)` returns false for a round with no clues, so today an empty Double board would go to the Double interstitial.
- **Remember on the device**: the host device keeps the last options in `localStorage` and applies them with the PATCH right after `POST /v1/rooms` succeeds. `POST` is unchanged.
- **Clients learn the timings** from the snapshot: optional `buzzWindowMs` and `answerWindowMs` on `RoomSnapshot` (sent on every connect). `web/src/game/timing.ts` constants become the defaults. Phones stop listening at `answerWindowMs`; the countdown bars use these lengths.

## Subtasks (narrow → wide)

1. **shared**
   - `domain.schema.json`: `TimerPace` enum `relaxed | standard | fast`.
   - `openapi.yaml`: implement-ready `PATCH /v1/rooms/{roomId}` body: `seasons` (as now), `timers` (`TimerPace`), `doubleRound` (boolean), `maxPlayers` (as now); all optional, at least one. `Room` response gains `timers` and `doubleRound` (always present in responses). Problems: 403 `not-the-host`, 409 `game-started`, 400 `invalid-settings` (seasons empty or outside 1–40).
   - `server-message.schema.json`: optional `buzzWindowMs`, `answerWindowMs` (integers) on `RoomSnapshot`.
   - `mise run gen`; commit generated code.
2. **supabase** (migration below): enum, columns, `set_room_options`, `start_game` copies options and skips Double.
3. **api** (`api/internal/rooms`): `Patch` handler → `set_room_options` via `db.AsUser`; maps SQL errors to the problems above; returns `Room`. Route wiring in `api/internal/server`. Room reads include `timers`, `doubleRound`.
4. **game**
   - `play.Setup`: `BuzzWindow`, `AnswerWindow time.Duration`, `DoubleRound bool`. Replace the `BuzzWindow`/`AnswerWindow` constants' uses in `game.go` and `wager.go` (Daily Double answers use the answer window) with the Setup values; keep the constants as the Standard values.
   - `nextAfterClue`: with `!DoubleRound`, after Single go to Final (`startFinal…`), no interstitial.
   - `room/pgstore.go` `LoadGame`: read `games.timers`, `games.double_round`; map pace → durations in one function (`play.Pace(p)`).
   - Snapshot: `buzzWindowMs`, `answerWindowMs`.
5. **web**
   - `web/src/lib/rooms.ts`: `updateRoomOptions(roomId, options)`; `web/src/lib/gameOptions.ts`: load/save last options (try/catch storage), defaults, summary text ("Seasons 20–40 · Fast timers · No Double Schmegettes").
   - New `web/src/game/GameOptionsSheet.tsx`: seasons range slider (Mantine `RangeSlider`, 1–40, min range 0 so one season works, years at the ends), segmented Timers control with the explanatory line, Double switch; changes apply at once (PATCH, optimistic, revert + toast on failure); fits 844 × 390.
   - `HostLobby.tsx`: **⚙ Options** button; summary line under the code; apply saved options after create.
   - `timing.ts` / countdown / `useAnswerCapture.ts`: use `buzzWindowMs` / `answerWindowMs` from state, defaulting to Standard.
6. **docs**.

## Key files

`shared/schemas/domain.schema.json`, `shared/openapi.yaml`, `shared/schemas/protocol/server-message.schema.json`; new migration; `api/internal/rooms/{handler,store}.go`, `api/internal/server/*.go`; `game/internal/play/game.go`, `wager.go`, `game/internal/room/pgstore.go`, `room.go`; `web/src/lib/rooms.ts`, new `gameOptions.ts`, new `web/src/game/GameOptionsSheet.tsx`, `web/src/pages/HostLobby.tsx`, `web/src/game/timing.ts`, `Countdown.tsx`, `useAnswerCapture.ts`.

## Contracts changed

- **REST**: the declared PATCH gets two optional request fields and a handler; `Room` gains two response fields. Additive.
- **WebSocket**: two optional fields on `RoomSnapshot`. Additive.
- **Domain**: new `TimerPace` enum, mirrored in Postgres.

## Success criteria

- Fast: 5 s buzz windows (and reopens) and 7 s answer windows, on the server and on phones; Relaxed 15 s / 12 s; Standard unchanged.
- Double off: the last Single clue goes straight to Final (no interstitial), the game has no Double rows, Final players are those above $0 then.
- Seasons 20–40: every board category comes from those seasons (or the existing fallback).
- Options change only while the room is `open`, and only by its host (server enforced); a rematch keeps them.
- A new room on the same device starts with the last options used; the TV summary line lists only non-defaults.
- A game recovered after a `game/` restart keeps its pace and Double setting.

## Test plan

- `mise run db:test`: new `supabase/tests/game_options.test.sql`: `set_room_options` as host (ok), as another member (42501), on an `in_game` room (55000), bad seasons (22023); `start_game` copies options to `games`; `double_round = false` builds no Double rows; grants.
- `mise run test:api -- ./internal/rooms/...`: PATCH happy path and each problem; response validates against the OpenAPI copy.
- `mise run test:game -- ./internal/play/... ./internal/room/...`: pace durations used for buzz/answer/DD answer; no Double → Final after Single; `LoadGame` reads options; snapshot fields.
- `mise run test:web -- src/game/GameOptionsSheet.test.tsx src/lib/gameOptions.test.ts src/pages/HostLobby.test.tsx`
- `mise run gen` and commit.

## Database migration plan

- File: `supabase migration new game_options`.
- `create type public.timer_pace as enum ('relaxed', 'standard', 'fast');`
- `alter table public.rooms add column timers public.timer_pace not null default 'standard', add column double_round boolean not null default true;`
- `alter table public.games add column timers public.timer_pace not null default 'standard', add column double_round boolean not null default true;` (existing games read as Standard with Double: what they were).
- `public.set_room_options(target_room uuid, new_seasons integer[], set_seasons boolean, new_timers public.timer_pace, new_double boolean, new_max integer)` (or one `jsonb` argument; implementer's choice, document it): `security definer`, `search_path = ''`; host check via `rooms.host_id = auth.uid()`, `status = 'open'` (55000 otherwise), seasons non-empty and within 1–40; updates the row. It's `security definer` because `update` on `rooms` is revoked from `authenticated` (the lobby migration's rule: rooms change only through functions); the checks inside are the only gate. Grant `execute` to `authenticated`.
- `create or replace function public.start_game(target_room uuid)`: copy `timers`, `double_round` into the new `games` row; build the Double round only when `double_round`.
- No new tables (no new RLS policies); the new columns are covered by the existing row policies. pgTAP covers the function and grants.
- Compatible with running code: new columns have defaults; the running `game/` ignores them; the running `api/` doesn't call the new function; `start_game` keeps its signature.

## Logging requirements

- api: on a rejected PATCH, the existing request log at `info`/`warn` per §3 with `room_id`; no new error-level logs (a refused setting is not an error).
- game: include `timers` and `double_round` as fields on the existing "game started" log line, with `room_id` and `game_id`.

## Docs to update

- `docs/system-docs/architecture/api-contract.md` (new problem types), `realtime-game-server.md` (timings come from the game; Double optional), `data-and-isolation.md` (new columns, `set_room_options`).
- `docs/product-docs/features/clue-catalog/feature-brief.md` is already updated.

## Branch

`enhancement/lobby-game-options-impl`, from and into `develop`. Jira isn't set up yet (`.github/jira.json` issue types are `REPLACE_ME`), so there's no `SCH-{N}`: the folder keeps its name, and the PR title is `[Enhancement] lobby-game-options: …`.
