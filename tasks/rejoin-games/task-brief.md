---
jira-type: new-feature
jira-title: "Rejoin a game in progress from Home; resume an unfinished game"
---
# Task spec: rejoin-games

Product brief: `tasks/rejoin-games/product-brief.md`. Rules: `docs/product-docs/features/rejoin-games/feature-brief.md` and `interaction-design.md`.

**Order:** after `lobby-game-options` (a resumed game keeps the options copied onto the game row). It's the largest task here; it can be split in two PRs (A: rejoin from Home, B: resume) if the implementation agent prefers, each a separate spec. Default: one PR, built in the order below.

## Approach

**A. Rejoin a live game** is mostly a lookup. Reload already works (`GET /v1/rooms/by-code/{code}` + the socket). Home needs to know which room the account is in: `GET /v1/me/current-room`, backed by a SQL function that only ever returns the caller's own rows.

**B. Resume an abandoned game** reuses `game/`'s recovery path. `play.Setup` already rebuilds a game from Postgres after a restart (scores, `LastCorrect`, active clue, Daily Double wager, Final wagers/answers/deltas), and `PGStore.LoadGame` finds the `in_progress` game by `room_id`. So resume = new room → resume lobby → on Start, re-attach the game to the new room, normalize its state in SQL (the table in the brief), mark it `in_progress`, and let `LoadGame` recover it.

**Moving devices.** Today a user may hold several sockets in a room. When a contestant connects while already connected, the room closes the older socket with WebSocket close code **4001** (reason `"other_device"`); the old page shows "You're playing on another device." and doesn't reconnect. The host's TV view keeps its existing "Only the host…" rule. Close codes aren't part of the JSON-schema contract; document 4001 in `realtime-game-server.md`.

## Subtasks (narrow → wide)

1. **shared**
   - `openapi.yaml`:
     - `GET /v1/me/current-room` → 200 `CurrentRoom` `{ kind: "lobby" | "game" | "resume_invite", roomId, code, role: "host" | "contestant", hostDisplayName, playerNames: string[] }`, or 204 when none.
     - `POST /v1/games/{gameId}/resume` → 201 `RoomJoin`; 403 `not-the-host`; 409 `not-resumable` (finished, in progress, or abandoned more than 30 days ago).
     - `GameDetail` (`GET /v1/games/{gameId}`): optional `resumableUntil` (date-time), present only for the game's host on a resumable game.
     - `POST /v1/rooms/join`: new 403 problem `not-in-game` (a resume room, caller wasn't a contestant).
   - `server-message.schema.json`: optional `resume` on `LobbyUpdated` and `RoomSnapshot`: `{ gameId, startedAt, players: [{ userId, displayName, score, back: boolean }] }`.
   - `mise run gen`; commit.
2. **supabase** (migration below).
3. **api**
   - `api/internal/account` (or `rooms`): `CurrentRoom` handler → `public.my_current_room()`.
   - `api/internal/games`: `Resume` handler → `public.resume_game(game, host_name)`; returns `RoomJoin` like `POST /v1/rooms`. `GameDetail` adds `resumableUntil`.
   - `api/internal/rooms`: map `not-in-game`.
   - Rate limit: `resume` shares the existing room-creation limit.
4. **game**
   - `room.Load`: read `rooms.resume_game_id`; build the `resume` lobby payload (game contestants with scores from `game_results`, `back` = room member).
   - Start in a resume room: needs ≥ 1 contestant member (the host counts if `host_plays`), and calls `public.start_resumed_game(room)` instead of `start_game`, then `LoadGame` and the normal recovery path. Fix any recovery gaps the brief's table exposes (see the SQL normalization below), with tests.
   - New connection for a contestant already connected → close the older socket with 4001.
   - Abandon of a resumed game: unchanged (`EndGame` abandoned, room closed). A resume lobby with no host for 30 min closes like any lobby; the game stays `abandoned`.
5. **web**
   - `web/src/lib/rooms.ts`: `currentRoom()`, `resumeGame(gameId, name)`.
   - `web/src/pages/Home.tsx`: the card (three variants) above everything, loaded with Home; tap → `/host/{code}` or `/join/{code}`; if the room ended meanwhile: "That game has ended." and hide.
   - `web/src/pages/GameScoreboard.tsx`: **Resume game** + "You can resume until {date}" when `resumableUntil`; creates the room and navigates to `/host/{code}`.
   - `web/src/pages/HostLobby.tsx`: resume variant ("RESUMING · Started {date}", players with scores, dimmed until back, count back/total, **Resume** button, no ⚙ Options; Join/Leave the game only if the host played).
   - `web/src/pages/JoinRoom.tsx`: in a resume room skip the name step ("You're back, {name}. {score}"); `not-in-game` copy: "This game is being resumed. Only its players can join."
   - Socket close 4001 → "You're playing on another device." (no auto-reconnect) in `web/src/lib/gameSocket.ts` / `room.ts`.
6. **docs**.

## Key files

`shared/openapi.yaml`, `shared/schemas/protocol/server-message.schema.json`; new migration; `api/internal/games/*`, `api/internal/account/*` or `rooms/*`, `api/internal/server/*`; `game/internal/room/{room,game,pgstore,hub}.go`, `game/internal/play/game.go` (recovery fixes only); `web/src/pages/{Home,GameScoreboard,HostLobby,JoinRoom}.tsx`, `web/src/lib/{rooms,room,gameSocket}.ts`.

## Contracts changed

- REST: two new endpoints, one optional response field, one new problem type. Additive.
- WebSocket: optional `resume` on two messages; close code 4001. Additive.

## Success criteria

- Closing the tab mid-game, then Home: the card shows; **Rejoin** restores seat, score and buzzer state (host: the TV view).
- A second device of the same account takes over the seat; the first shows the other-device message.
- Resume within 30 days by the host: board, done clues, scores and control match the abandoned game, per the brief's table; seen clues unchanged; options unchanged.
- Non-players can't join a resume room (`not-in-game`); each contestant's account takes back exactly their seat and name.
- A resumed game that finishes appears once in My games as finished and counts in stats; `started_at` is unchanged.
- Resume is refused for non-hosts, finished games, games in progress, and after 30 days (server enforced).

## Test plan

- `mise run db:test`: new `supabase/tests/rejoin_games.test.sql`:
  - `my_current_room()` returns only the caller's room (game over lobby), the resume invite for a contestant of the resumed game, nothing after the game ends; never another user's rows.
  - `resume_game`: host ok; non-host 42501; finished / in-progress / 31-day-old → refused; second call reuses the open resume room; closes the host's other open lobbies.
  - `join_room` on a resume room: contestant of the game ok (name from `game_players`); stranger refused.
  - `start_resumed_game`: each row of the brief's table (board, mid-clue, Daily Double, correct response, interstitial, Final category/wager/answer, Final reveal) normalizes as specified; `games.room_id` moves; status `in_progress`, `finished_at` null; grants (`game_engine` only).
- `mise run test:api -- ./internal/games/... ./internal/account/... ./internal/rooms/...`: new endpoints and problems, validated against the OpenAPI copy.
- `mise run test:game -- ./internal/room/... ./internal/play/...`: resume lobby payload; Start needs one contestant back; recovery from each normalized state; 4001 takeover.
- `mise run test:web -- src/pages/Home.test.tsx src/pages/GameScoreboard.test.tsx src/pages/HostLobby.test.tsx src/pages/JoinRoom.test.tsx src/lib/gameSocket.test.ts`
- `mise run gen` and commit.

## Database migration plan

- File: `supabase migration new rejoin_games`.
- `alter table public.rooms add column resume_game_id uuid references public.games (id) on delete set null;` plus a partial unique index on `resume_game_id` where `status = 'open'` (one resume lobby per game).
- `public.my_current_room()`: `security definer`, `search_path = ''`, filters on `auth.uid()` only; returns the caller's open/in-game membership (game first), or an open resume room whose game lists the caller as a contestant and the caller isn't yet a member. Grant `execute` to `authenticated` only.
- `public.resume_game(target_game uuid, host_name text) returns uuid`: `security definer` with explicit checks: caller is `games.host_user_id` and `private.user_is_host(...)`; `status = 'abandoned'`; `finished_at >= now() - interval '30 days'`; reuse an open resume room for the game if one exists; else close the caller's other `open` rooms (as `create_room` does), create the room with a new code using the same generator as `create_room` (factor it into a private helper if needed), set `resume_game_id`, `host_plays` = whether the host was a contestant in the game, and the host membership. Grant to `authenticated`.
- `create or replace function public.join_room(text, text, public.player_role)`: when `resume_game_id` is set, only users with a `contestant` row in that game's `game_players` may join (else raise with a code the api maps to `not-in-game`); their member name is the game's `display_name`; the player limit doesn't apply.
- `public.start_resumed_game(target_room uuid) returns uuid` (game id): for `game_engine`. In one transaction: lock room and game; set `games.room_id = target_room`, `status = 'in_progress'`, `finished_at = null`; normalize: an `active` board clue → `unanswered` (no answer rows added); Final not yet revealing (no scored Final answers) → delete that game's Final wagers and drafts so Final restarts from the category; Final revealing → keep; set the room to `in_game`. Grant `execute` to `game_engine` only.
- RLS: no new tables. `rooms.resume_game_id` is covered by existing row policies; members can read it, which is fine (it's their game).
- pgTAP: as above, plus `function_privs_are` for all four functions.
- Compatible with running code: the new column is nullable and unused by the old code; `join_room` keeps its signature and behavior when `resume_game_id` is null.

## Logging requirements

- game: `info` "game resumed" with `room_id`, `game_id`, `players_back` (count); `info` "socket replaced" with `room_id`, `user_id` on a 4001 takeover. A refused join or resume is not an error.
- api: existing request logging; on `not-resumable`/`not-in-game` no error-level log.
- Never log display names lists, codes with user ids together beyond existing fields, tokens, or answers above `debug`.

## Docs to update

- `docs/system-docs/architecture/realtime-game-server.md`: resume lobby, start of a resumed game, recovery normalization, close code 4001.
- `docs/system-docs/architecture/api-contract.md`: `not-the-host`, `not-resumable`, `not-in-game`.
- `docs/system-docs/architecture/data-and-isolation.md`: `resume_game_id`, the four functions and their grants.

## Branch

`new-feature/rejoin-games-impl`, from and into `develop`. Jira isn't set up yet (`.github/jira.json` issue types are `REPLACE_ME`), so there's no `SCH-{N}`: the folder keeps its name, and the PR title is `[New Feature] rejoin-games: …`.
