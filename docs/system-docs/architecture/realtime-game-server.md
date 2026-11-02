# Realtime Game Server (`game/`)

> **Current state:** rooms run on a single `game/` instance with no Redis yet. Everything needed to resume is in Postgres: lobby members, names, `host_plays`, and status, and for a game its `board_clues` states and `answers`. A restart costs a reconnect. A game resumes paused on the active clue, which is re-read when the TV is back; scores and control come from the answers. Room ownership, Redis fan-out, and snapshots below are a later task.

## Principles

- **Server-authoritative.** Clients send intents (`buzz`, `select_clue`, `submit_answer`). The server decides what happened and broadcasts the result. The prototype let clients run timers and add their own score; that is not allowed here.
- **One owner per room.** Exactly one instance runs a room's state machine at a time.
- **Fan-out through Redis.** Any instance can hold a player's socket. Every event is published to `room:{id}` and relayed to local sockets, so the server scales horizontally.
- **Recoverable.** On every phase change the owner writes a snapshot to Redis (`room:{id}:snapshot`). A new owner resumes from it.

## Connecting

`GET /rooms/{roomId}/ws` with subprotocols `["schmegettes.v1", "bearer.{jwt}"]`. Browsers can't set headers on a WebSocket, so the token travels as a subprotocol. The server:

1. verifies the JWT against the Supabase JWKS and checks room membership (as the user, through RLS)
2. accepts with subprotocol `schmegettes.v1` only (the token is never echoed back)
3. sends a `room_snapshot`, then live events

Proxies may log `Sec-WebSocket-Protocol`. If the chosen host does, switch to a short-lived single-use ticket from the API (`POST /v1/rooms/{id}/ticket`), and update this doc and `web/src/lib/gameSocket.ts`.

## Room ownership

- The owner holds `room:{id}:owner` in Redis (`SET NX PX 10000`, renewed every 3 s).
- Intents arriving at a non-owner instance are forwarded on `room:{id}:intents`.
- If the lease expires (crash, deploy), the next instance to receive an intent takes it over, loads the snapshot, and continues. Timers restart from the snapshot's `deadlineAt`.
- On SIGTERM an instance releases its leases after a final snapshot, so a deploy hands rooms over within a second.

## Lobby

`internal/room` runs one goroutine per room; sockets talk to it through channels, so intents are handled one at a time.

| Intent | Who | Effect |
|---|---|---|
| `set_display_name` | any member | `set_member_name()`, then `lobby_updated` |
| `set_host_plays` | host | `set_host_plays()`, then `lobby_updated` (the host appears in `players` with role `host`) |
| `leave_room` | non-host | `leave_room()`, the leaver's sockets close, then `lobby_updated` |
| `start_game` | host, 2+ contestants (a playing host counts) | see Recording. Fewer than 2 → `error: not_enough_players`; a second press while starting is ignored |

- Joining is REST (`POST /v1/rooms/join`), because membership must exist before the socket connects. Every new socket makes the room reload its members, which is how a join reaches the TV.
- Presence: a member is `connected` while any of their sockets is open. A disconnected contestant stays listed and counts toward Start.
- Every 30 s a room checks whether it was closed elsewhere (the host created a new room) and sends `room_closed: replaced`. A lobby whose host device has been gone 30 minutes is closed with `room_closed: host_absent`.
- **Start vs. join:** `join_room()` and `start_game()` both lock the room row, so a join in flight when Start commits gets "game started"; if `start_game()` fails, the room stays open.

## Gameplay

The rules live in `internal/play`, a pure state machine: inputs (pick, reading done, buzz, answer, progress, timer, connect or disconnect) take the current time and return effects (broadcasts and records). `internal/room` owns the sockets, the room's one timer (armed for `Game.Deadline()`), and the writes. Timings and fairness rules: [gameplay interaction design](../../product-docs/features/gameplay/interaction-design.md).

- **TV-only fields.** Clue text (`BoardClue.clueText`) and `correctResponse` are filled in only on the copy sent to the host user's sockets; every other socket gets the same message, with the same `seq`, without them. A correct response reaches the TV in `answer_judged` (when correct) and `clue_ended`.
- **Every gameplay message has a `seq`**, including lockouts (`buzz_result: locked_out`), so client gap detection holds. Only `error` and `pong` are unsequenced.
- **Host device = clock.** With no host socket the game pauses (`game_paused`); timers stop. When the TV is back, an active clue is read again from the start. After 30 minutes without it, the game ends `abandoned` and the room closes.
- **Control handoff.** Only the controller may pick (`not_in_control` otherwise, the host device included). While the board is up and the controller has no socket, `Game.Deadline()` is a handoff 10 s out; when it fires, control passes to the next connected contestant in join order and a `phase_changed` carries the new `controllingUserId`. `internal/room` logs it at `info` (`control passed`, `from_user_id`, `to_user_id`).
- **Writes** happen in order through the Recording functions below plus `finish_clue`. A failed write is retried on the next event (they're idempotent). The in-memory game never waits on the database.
- **Recovery** (`Store.LoadGame`): the game in progress, both rounds of `board_clues` with clue text and responses, and the answers so far (scores, last correct answerer for control, who tried the active clue). Control comes from the last correct answer, so a disconnect handoff made before a restart is not restored.

## Buzzing

- Buzzing opens when the host (or the read timer) moves the clue to `buzzing_open`.
- A buzz before that earns a lockout (`buzz_result: locked_out`, 250 ms), as on the show.
- The first buzz the owner *receives* after opening wins. `clientSentAt` is logged for latency analysis but never trusted for ordering.

## Messages

Defined in `shared/schemas/protocol/`. Every server message carries `roomId` and `seq` (+1 per room event). A client that sees a gap reconnects and gets a fresh snapshot. The correct response and clue text go only to the host device (see Gameplay), never to a phone.

## Recording

Game history and fresh boards are written through Postgres functions, called as `game_engine`. Each is one transaction and safe to call again, so a new room owner can replay the last step after a crash.

| When | Call |
|---|---|
| Host presses Start | Send phase `building_board`, close joining, call `start_game(room)`. It records the game and its players and builds the board. On error, send the room back to `lobby` with "Couldn't build a board. Try again." |
| A spectator joins mid-game | `add_spectator(game, user)` |
| A clue's text is shown | `reveal_clue(board_clue)`: everyone in the game has now seen it |
| An answer is judged | `record_answer(id, board_clue, user, answer, source, verdict, score_delta)`, with an `id` generated before the first attempt |
| A clue ends | `finish_clue(board_clue, 'answered' \| 'unanswered')` |
| Host override or appeal result | `update_verdict(answer, verdict, score_delta)` |
| A player leaves | `player_left(game, user)` |
| Final revealed / room closed or empty | `end_game(game, 'finished' \| 'abandoned')`; the room reopens for a rematch |

Scores shown live come from the room state; the stored score is the sum of answers (`game_results`), so the two match as long as every judged answer is recorded.

## Judging

`internal/judge` normalizes both strings (case, punctuation, "What is", articles, parenthetical hints) and allows one edit per five characters. The host can override any verdict (`override_verdict`). Disputes can be appealed to the worker (`appeal_answer` job).
