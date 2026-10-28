---
jira-type: new-feature
jira-title: "Gameplay core loop: pick, read, buzz, answer by voice, judge"
---
# Task spec: gameplay (core loop)

Product: [product-brief.md](./product-brief.md), [feature-brief.md](../../docs/product-docs/features/gameplay/feature-brief.md), [interaction-design.md](../../docs/product-docs/features/gameplay/interaction-design.md). The host player bar is specified in [lobby interaction-design.md](../../docs/product-docs/features/lobby/interaction-design.md).

**What ships:** after Start, a full Single + Double game:
- the controller picks on their phone, or the host device picks on the TV
- the TV reads the clue aloud
- buzzing opens when reading ends, with a 250 ms early lockout
- the buzz winner speaks the answer, which is judged by `internal/judge` and scored
- buzzing reopens for the others after a wrong answer
- the correct response shows on the TV
- the Double round, then final scores, with the game recorded as finished
- the host plays from the player bar on the TV view

**Confirmed product decisions:** silence or a blocked microphone counts as incorrect (−value). The game ends `finished` after Double until feature 2.

## Decisions (approve with the spec)

1. **Speech recognition runs on the device.** The Web Speech API is used on phones and on the host device's player bar. Only the final transcript is sent (`submit_answer`, which already exists). Interim text is sent throttled (`answer_progress`, at most 4 per second) so the TV can show it live. No audio leaves the device.
2. **Still one instance, still no Redis, now recoverable from Postgres.** Everything needed to resume is already stored:
   - `board_clues.state` and `revealed_at`
   - `answers`, which give the scores, who tried the active clue, and who last answered correctly (control)
   - the game itself (`games.status = 'in_progress'`)

   After a restart, a room rebuilds the game, re-reads any clue that was `active`, and gives control to the last correct answerer. If there isn't one, it picks again (Double: lowest score). Timers restart from the beginning of their step. Redis ownership and fan-out remain a later task.
3. **The game rules are a pure state machine** (`game/internal/play`) with no I/O, sockets, or wall clock. It takes events (pick, reading done, buzz, answer, timer fired, connect or disconnect) and returns effects: messages to broadcast, records to write, and the next timer. `internal/room` owns I/O and timers, and feeds it. Fairness rules are therefore unit-tested deterministically.
4. **TV-only content goes only to the host user's connections.** Clue text (`BoardClue.clueText`) and `correctResponse` are filled in only on messages sent to sockets whose user is the room's host. Every other socket gets the same message (same `seq`) without them. This is how "a phone never receives clue text or a correct response" is enforced, and it is tested on the outgoing bytes.
5. **Every gameplay message is broadcast with a `seq`**, including lockouts (`buzz_result: locked_out`), so client gap detection stays correct. Nothing is unicast except `error` and `pong`, which have no `seq`.
6. **A room with a game in progress stays loaded when all sockets drop**, so the pause and abandonment timers keep running. Only a `finished` game, or a lobby (existing rules), unloads.
7. **After the game ends**, `end_game()` reopens the room (`status = 'open'`), as today. The room stays in phase `finished` in memory, showing final scores. If it reloads (restart), it comes back as a lobby. Feature 3 turns this into Rematch.

## Subtasks (narrow → wide)

### 1. `shared/`: contracts (additive)

`client-message.schema.json`, new messages:

| `type` | Fields | Who | When |
|---|---|---|---|
| `reading_done` | `clueId` | host only | `clue_reading`, and only for the active clue |
| `answer_progress` | `clueId`, `text` (≤200) | the answering player | `answering`; throttled to 4 per second by the server (extras dropped) |

These existing messages are used as they are:
- `select_clue {clueId}`: `clueId` is the `board_clues.id`
- `buzz {clueId, clientSentAt}`
- `submit_answer {clueId, answer, source: "voice"}`

`server-message.schema.json`:

- **`RoomSnapshot`**, new optional fields:
  - `controllingUserId` (exists), `activeClueId` (exists)
  - `activeClue` (a `BoardClue`; text only for the host)
  - `deadlineAt`
  - `answeringUserId`
  - `attemptedUserIds` (array)
  - `paused` (boolean)
  - `scores` (`userId → score`)
- **`PhaseChanged`**: add optional `answeringUserId`, `attemptedUserIds`, `controllingUserId`, and `paused`.
- **New messages:**
  - `answer_progress`: `roomId`, `seq`, `userId`, `text`
  - `clue_ended`: `roomId`, `seq`, `clueId`, `state` (`answered` | `unanswered`), `correctResponse` (host only), `controllingUserId`, `scores`
  - `round_started`: `roomId`, `seq`, `round`, `board` (`BoardClue[]`), `controllingUserId`
  - `game_over`: `roomId`, `seq`, `results` (array of `{userId, displayName, score, placement}`, ties share a placement)
  - `game_paused`: `roomId`, `seq`, `paused` (boolean)
- **`AnswerJudged.correctResponse`** stays optional and is filled for the host only.
- **`Error.code`**: add `not_in_control`, `already_attempted`.
- **Description fix:** the realtime doc's "The correct response is sent only in `answer_judged`" changes to "only to the host device, in `answer_judged` and `clue_ended`".

Run `mise run gen` and commit TypeScript, Go (game, api), and Python.

### 2. `supabase/`: migration `supabase migration new gameplay`

- `finish_clue(target_board_clue uuid, final_state public.clue_state) returns void`:
  - `security invoker`, granted to `game_engine`
  - sets `state` to `answered` or `unanswered` (any other value raises `22023`)
  - does nothing if the clue is already finished, so retries are safe
- `game_engine` already has `update` on `board_clues` and an `engine_board_clues` policy, so no new grants are needed beyond `execute`.
- **pgTAP `supabase/tests/gameplay.test.sql`:**
  - `finish_clue` sets the state, and a second call does nothing
  - `finish_clue` rejects `active` and `unplayed`
  - `authenticated` can't execute it
  - a playing host (`host_plays`) can `record_answer` (they're a contestant in `game_players`)
  - `game_results.score` equals the sum of answers after a correct, an incorrect, and a second correct answer
- **Compatible with running code:** this only adds a function.

### 3. `game/internal/play`: the state machine (pure)

`Game` holds:
- round, board (both rounds, with clue text and response, from Postgres)
- phase, active clue, controller, scores
- attempted set, answering user, lockouts (`userId → until`)
- `paused`, contestants in join order

Inputs, each `func(now time.Time, …) Effects`:

| Input | Rule |
|---|---|
| `Pick(user, clueID)` | Phase `board`, clue not finished, and the user is the controller or the host. Otherwise `not_in_control`. Ignored if another pick already won. |
| `ReadingDone(user, clueID)` | Host only, active clue, `clue_reading`. Opens buzzing with a 5 s deadline. |
| `ReadTimeout` | Opens buzzing (the fallback; the deadline is set at pick: `min(12s, 1s + words/2.5)`) |
| `Buzz(user, at)` | In `clue_reading`: lock out until `at + 250ms` and broadcast `locked_out`. In `buzzing_open`: refused if locked out, already attempted, or not a contestant. The first valid buzz wins, enters `answering`, and sets the deadline to now + 7 s + 1.5 s grace for the final transcript. Buzzes during `answering` are ignored. |
| `AnswerProgress(user, text)` | Answering user only. Broadcast, throttled. |
| `Answer(user, text)` | Answering user only. `judge.IsCorrect`. Correct: +value, control moves to them, clue ends `answered`. Incorrect: −value, attempted += user. If any connected contestant hasn't tried, `buzzing_open` again for 5 s; otherwise the clue ends `unanswered`. |
| `AnswerTimeout` | Same as an empty incorrect answer (−value): silence counts as wrong |
| `BuzzTimeout` | Clue ends `unanswered`, control unchanged |
| `Disconnect(user)` while they are answering | No score change. Attempted += user, then reopen or end as for incorrect, with no answer recorded. |
| `HostGone` / `HostBack` | Pause: stop all deadlines and broadcast `game_paused`. On return, an active clue restarts at `clue_reading` (re-read), keeping the attempted set except a player who was mid-answer. |
| `ClueEndTimeout` (3 s after the clue ends) | Back to `board`. When the round's clues are all finished: Single → a `round_started` Double after the 3 s interstitial, with control to the lowest score (join order breaks ties). Double → `game_over`. |

Effects carry: broadcasts (each marked for TV-only fields), records (`reveal_clue` at pick, `record_answer` with a pre-generated UUID, `finish_clue`, `end_game`), and the next deadline. Unit tests drive this directly.

### 4. `game/internal/room`: run the game

- After `start_game()` succeeds, and on load of an `in_game` room, call the new `Store.LoadGame(roomID)`. It loads the in-progress game, both rounds of `board_clues` joined to `clues` (text, response), answers, and contestants. Build `play.Game` from it (recovery rules in Decision 2), then broadcast `round_started` (or a snapshot on load).
- **Timers:** one `time.Timer` per room for the next deadline, fired as an event into the room loop. The clock is injected (`Config.Now`, plus `Config.AfterFunc` for tests).
- **Records:** apply effects in order, through `PGStore` as `game_engine`: `RevealClue`, `RecordAnswer`, `FinishClue`, `EndGame`. A failed write is logged at `error`, and the in-memory game continues. The write is retried once on the next event; `record_answer` and `reveal_clue` are safe to retry.
- **Per-recipient encoding:** encode each broadcast twice (host and others) with the same `seq`, and send by `client.UserID == hostID`.
- **Host presence** drives `HostGone`/`HostBack` in game phases. The existing 30-minute host-absence rule in game phases calls `end_game(game, 'abandoned')` and closes the room (`room_closed: host_absent`).
- **New intents** go through the existing `handle()` switch: `select_clue`, `reading_done`, `buzz`, `answer_progress`, `submit_answer`. In the lobby they're `wrong_phase`, as today.
- Decision 6 (keep a game in progress loaded) replaces the current "drop when empty outside lobby" rule.

### 5. `web/`

- **`lib/speech.ts`:**
  - `speak(text): Promise<void>` (SpeechSynthesis; resolves on `end`, and on `error` or unavailable too, so the fallback timer covers it)
  - `useRecognizer()`, wrapping `SpeechRecognition` / `webkitSpeechRecognition`: `start()`, interim and final callbacks, auto-stop on silence or after 7 s, and `supported`
  - `requestMicrophone()`, using `getUserMedia({audio:true})` from a user gesture
- **`lib/room.ts`:** extend `RoomState` and `reduceRoom` with board, round, active clue, deadline, answering user, attempted users, controller, scores, paused, the last verdict, results, and the live transcript. Handle every new message.
- **Components (`web/src/game/`):**
  - `Board` (TV: full grid, tappable for the host; phone: category + value grid, tappable only for the controller, never clue text)
  - `ClueScreen` (TV)
  - `ScoreBar`
  - `Buzzer` (dim / lit / locked / "Too early" states, at least 64 px)
  - `AnswerCapture` (auto-starts the recognizer when this user wins the buzz, streams `answer_progress`, sends `submit_answer` with the final transcript)
  - `Countdown` (renders from `deadlineAt`)
  - `GameOver`
- **TV (`HostLobby` → `HostGame` when the phase isn't `lobby`):** Board, ClueScreen, verdict and correct-response overlays, the paused banner, and game over. It speaks the clue on `clue_reading` and sends `reading_done` when speech ends. When `hostPlays`, it shows the **player bar** (Buzzer with the space bar, AnswerCapture, own score).
- **Phone (`JoinRoom` → `PlayerGame`):** the states in the interaction-design phone table.
- **Microphone in the lobby:**
  - after joining, phones show "Allow the microphone so you can answer" (a button that calls `requestMicrophone()`); same for the host when they press Join the game
  - unsupported recognition: "This browser can't hear answers. Try Chrome or Safari."
  - a blocked microphone: a persistent warning before each clue
- Clue text, the correct response, and the player's own transcript come from the server or the recognizer only. The phone renders nothing from `clueText` even if it arrives (defense in depth).

### 6. Docs

- `docs/system-docs/architecture/realtime-game-server.md`:
  - the gameplay loop and the `play` package
  - the TV-only field rule
  - recovery from Postgres
  - the timing table, which points to the product doc
  - update the "Current state" note and the Messages section
- `docs/product-docs/features/lobby/interaction-design.md`: link the player bar to the gameplay doc (no rule changes)

## Key files

- `shared/schemas/protocol/*.schema.json`, `shared/test/schemas.test.ts`
- `supabase/migrations/*_gameplay.sql`, `supabase/tests/gameplay.test.sql`
- `game/internal/play/{game.go,effects.go,game_test.go}`
- `game/internal/room/{room.go,game.go,pgstore.go,room_test.go}`
- `web/src/lib/{speech.ts,room.ts}`
- `web/src/game/*.tsx`
- `web/src/pages/{HostLobby,JoinRoom}.tsx`

## Contracts

Additive only: new client and server messages, new optional fields, new error codes. No REST change. `domain.schema.json` is unchanged (every phase name already exists).

## Success criteria

1. Two phones and a TV play a full Single + Double game to final scores without a reload
2. Two buzzes arriving 1 ms apart: the first received wins, and every client shows the same winner
3. A buzz during reading is locked out for 250 ms and can't win inside that window
4. "what is nitrogen" for "Nitrogen" is judged correct. "oxygen" scores −value and reopens buzzing for everyone else. A player can't buzz the same clue twice.
5. No byte sent to a non-host socket contains a clue's text or correct response (tested on the outgoing messages)
6. Reloading a phone mid-clue restores the phase, deadline, and a locked buzzer if it already tried
7. Host device disconnect pauses everything; reconnect re-reads the active clue
8. Restarting `game/` mid-game resumes from Postgres with the same board state and scores
9. `game_results` scores equal the TV's final scores
10. The host plays from the player bar (space bar buzzes), under the same rules

## Test plan (targeted only)

| Package | Tests | Command |
|---|---|---|
| shared | fixtures for each new message; `clueText` stays optional | `bun run --cwd shared test` |
| supabase | `gameplay.test.sql` (above) | `mise run db:test` |
| game/play | Table tests, each with a fixed clock: pick authorization (controller, host, others); a re-pick of a finished clue; reading → buzz-open via `ReadingDone` and via the timeout; early-buzz lockout timing (249 ms refused, 250 ms ok); first buzz wins; second buzz ignored; one attempt per clue; correct/incorrect/timeout scoring; reopen versus end when everyone has tried; disconnect while answering (no penalty); pause/resume re-read; round change and the lowest-score controller with a tie-break; game over placements with ties | `mise run test:game -- ./internal/play/...` |
| game/room | Fake store and clock: a full scripted mini game (2×1 board) end to end; per-recipient encoding (assert that non-host bytes contain neither the clue text nor the response); recovery from `LoadGame` mid-clue; records issued in order; abandonment after 30 min of host absence in a game | `mise run test:game -- ./internal/room/...` |
| web | `reduceRoom` for every new message; `Buzzer` states; `Board` (the phone never renders `clueText`; only the controller can tap); `AnswerCapture` with a fake recognizer (auto-start, throttle, final submit); `HostGame` speaks and sends `reading_done` (mocked `speechSynthesis`); `PlayerGame` per phase | `mise run test:web -- src/lib/room.test.ts src/game/ src/pages/HostLobby.test.tsx src/pages/JoinRoom.test.tsx` |

Manual: a TV (desktop Chrome) plus 2 phones (iOS Safari and Android Chrome) on the LAN, with `ALLOWED_ORIGINS` set, for a full game. Also unplug the TV's network mid-clue, and restart `game/` mid-clue.

## Logging

| Event | Level | Fields |
|---|---|---|
| `game loaded` (start or recovery) | info | `room_id`, `game_id`, `round`, `recovered` |
| `clue picked` | debug | `room_id`, `game_id`, `board_clue_id`, `user_id` |
| `buzz won` / `buzz locked out` | debug | `room_id`, `user_id`, `latency_ms` (from `clientSentAt`, advisory) |
| `answer judged` | debug | `room_id`, `game_id`, `user_id`, `verdict`, plus `answer` (the player's words, debug only) |
| `game paused` / `game resumed` | info | `room_id`, `game_id` |
| `round started` / `game over` | info | `room_id`, `game_id`, `round` |
| record write failed | error | `room_id`, `game_id`, `op`, `err` |

Never log clue text, correct responses, transcripts above `debug`, tokens, or whole messages. Wrong answers, lockouts, and timeouts are gameplay: `debug`.

## Docs to update

Subtask 6.

## Branch
`new-feature/gameplay`, from and into `daily/2026-10-27`. There is no Jira key: Jira isn't configured.
