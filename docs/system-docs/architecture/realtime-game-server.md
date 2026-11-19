# Realtime Game Server (`game/`)

**Source of truth:** `game/`

> **Current state:** rooms run on a single `game/` instance with no Redis yet. Everything needed to resume is in Postgres: lobby members, names, `host_plays`, and status, and for a game its `board_clues` states, `answers`, and `wagers`. A restart costs a reconnect. A game resumes paused on the active clue, which is re-read when the TV is back; scores and control come from the answers. Room ownership, Redis fan-out, and snapshots below are a later task.

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
| `leave_room` | non-host, in the lobby or on the final scoreboard (`finished`) | `leave_room()`, the leaver's sockets close, then `lobby_updated` (in the lobby) |
| `rematch` | host, phase `finished` (else `wrong_phase`; a second press back in the lobby is ignored) | First checks the host still has host access (`private.user_is_host`): if not, the host's sockets only get `error: not_a_host` and nothing is reset. Then the finished game is dropped, the room reloads its members (players who left are gone), and every socket gets a fresh `room_snapshot` in `lobby` at $0. `end_game()` already reopened the room, so Start builds a fresh board as usual |
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
- **Pick reveal and clue end.** A pick sets `revealUntil` (+1.5 s, `PickReveal`; +0.6 s for a Daily Double, `PickBlink`) and sends it on that pick's `phase_changed` only: never on a re-read after a pause, a later phase, or a snapshot, so the client never replays it. The reading deadline is `revealUntil` + `ReadingTime(clue)` (the clue only: there is no spoken announcement), and a `reading_done` before `revealUntil` just moves the deadline to it. On the correct-response screen the host device's `reading_done` (same `clueId`) brings the board back `ResponseTail` (1 s) later, never later than `ClueEndPause` (6 s) after the clue ended; with the override review open, the tail applies when it closes.
- **Resume** (rejoin-games). A room with `resume_game_id` is a resume lobby: `lobby_updated` and `room_snapshot` carry `resume` (the game's contestants, scores, and who is back). Start calls `start_resumed_game` instead of `start_game`, then recovers the game with `LoadGame` as after a restart and sends everyone a snapshot (no `round_started`). During a game, contestants of the game who aren't room members (not back yet) are listed as disconnected with their scores. A contestant who connects while already connected takes the seat over: the older socket closes with WebSocket close code **4001** (`other_device`), and the client stops reconnecting. The host's TV view is exempt.
- **Control handoff.** Only the controller may pick (`not_in_control` otherwise, the host device included). While the board is up and the controller has no socket, `Game.Deadline()` is a handoff 10 s out; when it fires, control passes to the next connected contestant in join order and a `phase_changed` carries the new `controllingUserId`. `internal/room` logs it at `info` (`control passed`, `from_user_id`, `to_user_id`).
- **Writes** happen in order through the Recording functions below plus `finish_clue`. A failed write is retried on the next event (they're idempotent). The in-memory game never waits on the database.
- **Recovery** (`Store.LoadGame`): the game in progress, both rounds of `board_clues` with clue text and responses, and the answers so far (scores, last correct answerer for control, who tried the active clue). Control comes from the last correct answer, so a disconnect handoff made before a restart is not restored.

## Wagers

Daily Doubles and Final Schmegettes live in `internal/play/wager.go`. Rules and timings: [wagers interaction design](../../product-docs/features/wagers/interaction-design.md).

- **Daily Double.** A pick on a `DailyDouble` clue goes to `daily_double_wager` (0.6 s blink + 2 s reveal + 30 s). Only the picker may `submit_wager`, $5 to max(score, the round's top value), else `invalid_wager`; no wager in time is $5. The wager is public (`wager_locked` with `amount` on every copy, `wager` on `phase_changed`). After a 2 s "wagers" step the clue is read ("For {wager}, here's the clue.") and, with no buzzing, the picker answers for ± the wager. A disconnect doesn't end a Daily Double answer: the window runs and no answer costs the wager.
- **Final.** When Double ends, contestants above $0 are finalists (none: `game_over` with `finalSkipped`, and the Final clue is never revealed). `final_category` holds at least 3 s (an earlier `reading_done` just moves the deadline), then `final_wager` (30 s, 0..score, $0 if none; wagers sent during the category count). `final_answer` reveals the clue; typing is open from then, and the 30 s window starts at `reading_done`. Answers are `submit_answer` with `source: typed`; `answer_progress` in this phase is a private draft, kept in memory and submitted at the deadline. `final_reveal` judges one finalist every 8 s, lowest pre-Final score first (join order on ties), recording each answer then. The correct response follows for 4 s, then `finish`.
- **Private copies.** A `Broadcast` can carry `Private[userID]`: the same message (same `seq`) with that user's own Final wager (`wager_locked.amount`) or answer (`final_submitted.answer`). `sendGame` gives it to that user's sockets only, and never to the host user: the host device is on the TV. Snapshots add `myWager`, `myFinalAnswer`, `myFinalSubmitted` the same way. Nothing else carries a Final amount or answer before the reveal.
- **Pause.** Wager and Final answer windows keep their remaining time across a host-device pause. A reading (the category, a clue) starts again, and a reveal step restarts.
- **Recovery.** `LoadGame` loads the Daily Double flag, the Final clue, and `wagers`. An active Daily Double with no wager restarts the wager; with one, it is re-read. Final resumes at the category (no wagers), the wager (some), the answer window (the clue shown, fresh 30 s, submitted answers kept), or the reveal (from the first finalist with no `answers` row). Drafts not yet submitted are lost on a restart.

## Buzzing

- Buzzing opens when the host (or the read timer) moves the clue to `buzzing_open`. The buzz window and answer time come from the game's timer pace (`games.timers`: relaxed 15 s / 12 s, standard 9 s / 9 s, fast 5 s / 7 s; `play.Windows`). The lobby no longer offers a pace, so every new game is standard (`set_room_options` always writes it); relaxed and fast remain only on games started before that, which keep them when resumed. The windows are sent to clients as `buzzWindowMs` / `answerWindowMs` on `room_snapshot`. With `games.double_round` off (`Setup.NoDouble`), Final follows the Single board with no interstitial.
- A buzz before that earns a lockout (`buzz_result: locked_out`, 250 ms), as on the show.
- The first buzz the owner *receives* after opening wins. `clientSentAt` is logged for latency analysis but never trusted for ordering.

## Messages

Defined in `shared/schemas/protocol/`. Every server message carries `roomId` and `seq` (+1 per room event). A client that sees a gap reconnects and gets a fresh snapshot. The correct response and clue text go only to the host device (see Gameplay), never to a phone.

## Recording

Game history and fresh boards are written through Postgres functions, called as `game_engine`. Each is one transaction and safe to call again, so a new room owner can replay the last step after a crash.

| When | Call |
|---|---|
| Host presses Start | Send phase `building_board`, close joining, call `start_game(room)`. It records the game and its players and builds the board. On error, send the room back to `lobby` with "Couldn't build a board. Try again." If the host has lost host access (`42501`), the room goes back to `lobby` and only the host's sockets get `error: not_a_host` ("Your host access was removed, so you can't start games."), logged at `info` |
| A spectator joins mid-game | `add_spectator(game, user)` |
| A clue's text is shown | `reveal_clue(board_clue)`: everyone in the game has now seen it |
| An answer is judged | `record_answer(id, board_clue, user, answer, source, verdict, score_delta, match_rule, heard)`, with an `id` generated before the first attempt. `source` is `voice`, or `typed` for Final; Final answers are recorded one by one at the reveal. `heard` is every non-empty transcript (null when nothing was heard); the verdict is also kept as `judge_verdict`. Logged at `debug` (`answer judged`: `answer_id`, `verdict`, `match_rule`, `heard_count`, `matched_index`; no transcript text) |
| A Daily Double or Final wager locks | `record_wager(board_clue, user, amount)`: the first wager wins |
| A finalist submits (or time runs out on their draft) | `submit_final_answer(board_clue, user, answer)`: the first submission wins |
| A clue ends | `finish_clue(board_clue, 'answered' \| 'unanswered')` |
| Host override or appeal result | `update_verdict(answer, verdict, score_delta)`; an `overridden_*` verdict stamps `overridden_at`. `judge_verdict`, `match_rule` and `heard` never change |
| A player leaves | `player_left(game, user)` |
| Final revealed / room closed or empty | `end_game(game, 'finished' \| 'abandoned')`; the room reopens for a rematch |

Scores shown live come from the room state; the stored score is the sum of answers (`game_results`), so the two match as long as every judged answer is recorded.

## Overrides

`internal/play/override.go`. Rules: [scoreboard and overrides](../../product-docs/features/scoreboard-and-overrides/feature-brief.md).

- **Window.** The judged answers of the clue just played, while its correct response is on screen (`ClueEndPause`), or the Final answer of the finalist on the reveal stage, during their `RevealStep`. A clue nobody buzzed on, and a buzz that disconnected before an answer, have nothing to override. Earlier clues can't be changed.
- **Review.** `override_review {open}` (host only) stops the step's clock and keeps its time left; closing restores it. Every socket gets `override_review_changed` with the answerers' ids, so their phones say the host is reviewing. A host-device pause closes the review; the clue's correct-response screen resumes with its time left.
- **Override.** `override_verdict {answerId, correct}` (host only; `not_host`, `wrong_phase`, `unknown_answer` otherwise; the same verdict again is ignored). The answer scores ±its amount (the clue's value, or the wager), so the score swings by twice that. On a regular clue, control goes to the latest correct answer on it, else back to whoever had it at the pick; a Daily Double and Final never move control. Every socket gets `verdict_overridden`; the write is `update_verdict()` with `overridden_correct` / `overridden_incorrect` and the new delta, logged at `info` (`verdict overridden`, `answer_id`, `user_id`, `to_verdict`, `score_delta`, `judge_verdict`, `match_rule`; never the answer text).
- **Snapshot.** In the window, `overrideReview` says whether a review is open, and the host's copy lists `clueAnswers`.
- The board clue's `finish_clue` state isn't rewritten by an override.

## Judging

`internal/judge` (`Judge(heard, response)`) normalizes both strings (case, accents, punctuation, "What is", articles, parenthetical hints, St/Mt/Dr, spoken numbers to digits) and returns the verdict, the rule that decided it (`MatchRule`) and which transcript matched. Rules, in order: **exact**; **spelling slip**, one edit per five characters with the same first letter; **sounds alike**, equal phonetic keys (`phonetic.go`: one letter per sound, vowel runs as one, word breaks dropped; one silent L or W may be missing) plus a spelling-closeness guard (edit distance at most 60% of the response's letters), not for one-word responses of 4 letters or fewer. Numbers must be the same number. A spoken answer is `submit_answer.answer` plus up to 4 `alternatives` (the recognizer's other guesses, most likely first); the first that matches decides, and `answer_judged.answer` is that transcript. Rules for players: [how an answer is matched](../../product-docs/features/gameplay/feature-brief.md#how-an-answer-is-matched). The host can override a verdict on the clue just played or the Final answer being revealed (see Overrides). Disputes can be appealed to the worker (`appeal_answer` job): **not yet implemented**.
