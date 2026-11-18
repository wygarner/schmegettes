---
jira-type: enhancement
jira-title: "Pick reveal animation instead of the spoken announcement; shorter wait after the correct response"
---
# Task spec: clue-pacing

Product brief: `tasks/clue-pacing/product-brief.md`. Rules: `docs/product-docs/features/gameplay/feature-brief.md` (Reading and buzzing; Answering and judging), `features/gameplay/interaction-design.md` (Timing, Pick reveal, Correct response), `features/wagers/feature-brief.md` (Daily Double reveal), `features/scoreboard-and-overrides/feature-brief.md` (clock pauses during review).

## Approach

**Start of a clue.** The server owns the timing; the client only animates.

- New constants in `game/internal/play/game.go`: `PickReveal = 1500 * time.Millisecond`, `PickBlink = 600 * time.Millisecond`, `ResponseTail = 1 * time.Second`. Delete `Announcement()` and its use in `readingText()`. A Daily Double keeps its own line ("For 1,000, here's the clue.").
- `Pick` (regular clue): `startReading` gets a `reveal bool`. With a reveal, `g.revealUntil = now + PickReveal` and `deadline = now + PickReveal + ReadingTime(clue text)`. `ReadingDone` before `revealUntil` defers to it (`deadline = revealUntil`, the same gate as `FinalTitle`), so buzzing never opens during the reveal. `resume()` calls `startReading(now, e, false)`: no reveal on a re-read.
- `Pick` (Daily Double): `revealUntil = now + PickBlink`; the wager deadline grows by `PickBlink` (`PickBlink + DDReveal + WagerWindow`). Wager submissions before `revealUntil` are refused (`wrong_phase`) the same way as today during `DDReveal`, if that's what the code does now; keep it consistent.
- Early buzzes during the reveal: the phase is already `clue_reading`, so the existing lockout applies unchanged.

**End of a clue.** The host device reports the end of the correct-response line with the existing `reading_done` message (same `clueId`; `g.active` is still set during `stepClueEnd`).

- `ReadingDone` in `stepClueEnd`: `deadline = min(deadline, now + ResponseTail)`. `ClueEndPause` (6 s from `endClue`) stays as the cap. If the override review is open (`g.reviewing`), set `reviewLeft = min(reviewLeft, ResponseTail)` instead, so the countdown resumes from there when the review closes.
- Final's correct response (after `final_reveal`) is unchanged; this applies to `stepClueEnd` only.

**Contract (additive).** Add optional `revealUntil` (`date-time`) to `PhaseChanged` and `RoomSnapshot` in `shared/schemas/protocol/server-message.schema.json`. The server sets it only on a fresh pick (regular: +1.5 s, Daily Double: +0.6 s); it's absent on a resume or reload, so the client never replays the reveal. Optional field = compatible (see `api-contract.md`).

**Client.**
- `web/src/game/HostGame.tsx`: `currentSpeech` for `clue_reading` speaks the clue only (no `announcement()`), and starts it at `revealUntil` (or at once if absent or past), so the narrator prepares during the reveal. The correct-response speech gets `reportDone: true`.
- New `web/src/game/PickReveal.tsx`: blink 0–0.6 s on the board cell (value flashes `yellow.4` ↔ white), then the cell's rect animates (FLIP: measure the cell, transform to the centered card) into a card about 60% of the stage width, `boardBlue.9` with the board bevel, category (Oswald, white, uppercase) and "$400" (`yellow.4`); board dims behind; holds the last 0.3 s; at `revealUntil` the clue screen replaces it. `prefers-reduced-motion`: the card fades in over the same window. Timing comes from `revealUntil` minus the clock offset the client already keeps (`Pong.serverTime`), not from a local timer started on receipt.
- Daily Double: blink only (0.6 s), then `DailyDoubleStage` as now.
- Phones (`web/src/game/PlayerControls.tsx`): while `now < revealUntil`, the text above the dim buzzer is "{Category} for ${value}"; then "Listen…".
- `web/src/lib/speech.ts`: delete `announcement()`.

## Subtasks (narrow → wide)

1. **shared**: `revealUntil` on `PhaseChanged` and `RoomSnapshot`; `mise run gen`; commit generated TS and Go.
2. **game**: constants; `startReading(reveal)`; `revealUntil` in `emitPhase` and `SnapshotFields`; `ReadingDone` reveal gate and `stepClueEnd` tail; Daily Double blink; delete `Announcement`. Recovery after a server restart: `revealUntil` is not restored (a recovered game re-reads without a reveal).
3. **web**: `PickReveal`, `HostGame` speech changes, phone text, `timing.ts` constants (`PICK_REVEAL_MS`, `PICK_BLINK_MS`, `RESPONSE_TAIL_MS`) mirroring the server.
4. **docs**: below.

## Key files

`shared/schemas/protocol/server-message.schema.json`; `game/internal/play/game.go`, `wager.go`, `override.go`; `web/src/game/HostGame.tsx`, `Board.tsx`, new `PickReveal.tsx`, `PlayerControls.tsx`, `timing.ts`; `web/src/lib/speech.ts`.

## Contracts preserved / changed

- **Changed (additive):** optional `revealUntil` on two server messages.
- Preserved: `reading_done` keeps its shape; it's now also accepted during `stepClueEnd` (was ignored). No REST or DB change.

## Success criteria

- No "Here's {category} for {value}" is spoken; `Announcement` and `announcement` are gone.
- Buzzing never opens before `revealUntil`; the server fallback is 1.5 s + `ReadingTime(clue)`.
- The reveal takes 1.5 s ± one frame on the host at 844 × 390 and 667 × 320, and doesn't wait on speech or the network.
- With a ~2.5 s correct-response line, the board returns ~3.5 s after the clue ended; with no report, at 6 s. During an override review, the 1 s tail resumes after the review.
- A resume or reload mid-clue re-reads with no reveal.
- Daily Double: 0.6 s blink, then the 2 s reveal; the wager window is unchanged in length.

## Test plan

- `game/internal/play/game_test.go`: pick sets `revealUntil` and deadline = 1.5 s + reading time; `ReadingDone` before `revealUntil` defers; after it opens buzzing; resume re-reads without `revealUntil`; `ReadingDone` in `stepClueEnd` shortens to 1 s and never extends past 6 s; a second `ReadingDone` is harmless.
- `game/internal/play/wager_test.go`: Daily Double deadline includes `PickBlink`; `revealUntil` = +0.6 s.
- `game/internal/play/override_test.go`: tail during an open review applies on close.
- `mise run test:game -- ./internal/play/... ./internal/room/...`
- `web/src/game/HostGame.test.tsx`: the clue line has no announcement and waits for `revealUntil`; the response line reports `reading_done`.
- New `web/src/game/PickReveal.test.tsx`: renders the card with category and value; reduced-motion path.
- `web/src/game/PlayerControls.test.tsx`: reveal text, then "Listen…".
- `mise run test:web -- src/game/HostGame.test.tsx src/game/PickReveal.test.tsx src/game/PlayerControls.test.tsx`
- `mise run gen` and commit.

## Database migration plan

None.

## Logging requirements

No new log events. If a debug log exists for `reading_done`, include `room_id` and `clue_id` only; never the response text.

## Docs to update

- `docs/system-docs/architecture/realtime-game-server.md`: timings (pick reveal, response tail), `reading_done` during clue end, `revealUntil`.
- `docs/product-docs/features/gameplay/interaction-design.md` is already updated; fix it if the build differs.

## Branch

`enhancement/clue-pacing-impl`, from and into `develop`. Jira isn't set up yet (`.github/jira.json` issue types are `REPLACE_ME`), so there's no `SCH-{N}`: the folder keeps its name, and the PR title is `[Enhancement] clue-pacing: …`.
