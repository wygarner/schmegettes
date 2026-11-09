---
jira-type: new-feature
jira-title: "Design pass 2/3: end-of-game scoreboard, Rematch, host overrides"
---
# Task spec: design-pass-endgame

Product brief: [product-brief.md](./product-brief.md). Rules: [scoreboard and overrides](../../docs/product-docs/features/scoreboard-and-overrides/feature-brief.md) and its [interaction design](../../docs/product-docs/features/scoreboard-and-overrides/interaction-design.md). Visual reference: `devtools/src/designs/results/scoreboard-and-history.tsx`.

**Depends on `design-pass-restyle`** (the shared UI pieces in `web/src/ui/`: `Stage`, `Sheet`, `GoldButton`, `PhoneScreen`, tokens). Start after it merges into the daily branch.

## What already exists

- `override_verdict` (`answerId`, `correct`) is in `shared/schemas/protocol/client-message.schema.json` and generated into `game/internal/contracts`, but `game/` doesn't handle it.
- `public.update_verdict(answer, verdict, score_delta)` exists, granted to `game_engine`, with a pgTAP test. `verdict` has `overridden_correct` / `overridden_incorrect`. `game_results` sums `score_delta`, so totals follow an override.
- `end_game()` reopens the room (`status = 'open'`), so the database already allows a rematch; `start_game()` builds a fresh board from the same room.
- `LoadGame` already treats `overridden_correct` as correct when it rebuilds control.
- `leave_room` is rejected outside `lobby` (`game/internal/room/room.go`).

## Subtasks

### 1. Contracts (`shared/`), additive only

Client messages (`client-message.schema.json`):

| Message | Fields | Rules |
|---|---|---|
| `override_verdict` (exists) | `answerId`, `correct` | Unchanged |
| `override_review` (new) | `open: boolean` | Host only. Opens or closes the review; pauses or resumes the clock |
| `rematch` (new) | — | Host only, phase `finished` |

Server messages (`server-message.schema.json`):

| Message | Fields |
|---|---|
| `verdict_overridden` (new, sequenced) | `answerId`, `userId`, `verdict` (`overridden_correct` / `overridden_incorrect`), `scoreDelta` (the answer's new delta), `scores`, `controllingUserId`, `deadlineAt` |
| `override_review` (new, sequenced) | `open: boolean`, `userIds` (the answerers under review), `deadlineAt` (null while open) |
| `game_over` (add optional) | `startedAt`, `finishedAt` (date-time), for the scoreboard's date and length |
| `room_snapshot` (add optional) | `clueAnswers` (host copy only: `answerId`, `userId`, `answer`, `verdict`, `scoreDelta` for the clue on the correct-response screen or the finalist on the reveal), `overrideReview` (boolean) |

Error codes: add `unknown_answer` (no such answer in the override window). Use the existing `not_host` and `wrong_phase` for the rest.

Run `mise run gen`; commit the generated TS and Go.

### 2. Game server (`game/`)

**`internal/play`** (pure state machine):

- Track, per clue, the judged answers (`answerId`, user, text, verdict, delta, amount) and `controlAtPick` (set in `Pick`).
- **Override window:** from `clue_ended` until the `ClueEndPause` (6 s) deadline fires; in `final_reveal`, the current finalist's answer from when it's judged until that step's `RevealStep` deadline.
- `Review(now, open)`: host only (`not_host`), only in the window (`wrong_phase`). Open: store the remaining time, clear the deadline (like the host-device pause), emit `override_review{open: true, userIds}`. Close: restore the deadline with the time left, emit `override_review{open: false, deadlineAt}`. Opening twice or closing when closed is a no-op.
- `Override(now, answerID, correct)`: host only, in the window, the answer must belong to the current clue or reveal step (`unknown_answer`). Same verdict as now: no-op. Otherwise: new delta `±amount` (clue value, or the wager for Daily Double and Final); update the in-memory score; recompute control for a regular clue (latest correct answer on that clue by judge time, else `controlAtPick`; a Daily Double and Final never move control); emit `verdict_overridden` and a `Record{Kind: UpdateVerdict, AnswerID, Verdict, Delta}`. Overriding does **not** close the review; the client sends `override_review{open:false}` after.
- A host-device pause while the review is open closes the review (the pause already stops the clock; on resume the deadline continues with its time left).
- `Rematch(now)`: host only, phase `finished` (`wrong_phase` otherwise). Returns an effect the room acts on (below). A second call is a no-op once the room is back in `lobby`.

**`internal/room`**:

- Route `override_review`, `override_verdict`, `rematch` (host user only; `not_host` otherwise).
- `Record{UpdateVerdict}` → `PGStore.UpdateVerdict(ctx, answerID, verdict, delta)` calling `public.update_verdict` (idempotent; retried like the other writes).
- **Rematch:** drop the finished `play.Game`, set the room phase to `lobby`, reload members (`store.Load`), and send every socket a fresh `room_snapshot` (phase `lobby`, scores 0). The room row is already `open` (`end_game`), so `start_game` works as in any lobby.
- **Leave in `finished`:** allow `leave_room` in phase `finished` as well as `lobby` (the game is already ended; no `player_left` needed).
- Snapshot: fill `clueAnswers` (host copy) and `overrideReview` when in the window.

### 3. Web

- **Override (host device):** on the correct-response stage and the Final reveal, each verdict line (from `answer_judged`, or the snapshot's `clueAnswers`) gets a small outlined **Override** button. Tap → send `override_review{open:true}` and open a centered `Sheet`: what they said (or "No answer heard"), the correct response, the score change ("$400 → $1,200"), the control change when there is one, **Keep** / **Mark correct** (or **Mark incorrect**). Keep / tap outside → `override_review{open:false}`. Mark → `override_verdict`, then `override_review{open:false}`. The sheet disables its buttons after the first press.
- On `verdict_overridden`: the verdict line flips color and gets the gold HOST OVERRIDE chip; scores and the PICKING ring update; the tile floats the swing.
- **Phones:** during `override_review{open:true}` with my id in `userIds`: "{host} is reviewing your answer…". On `verdict_overridden` for me: HOST OVERRIDE, big ✓/✗, the delta, "{host} changed your answer to correct/incorrect." Others: unchanged.
- **Scoreboard (host stage, phase `finished`):** "Final scores", date · start time · length (from `game_over.startedAt` / `finishedAt`), winner card (🏆, WINNER / TIED FOR 1ST, names, score), ranked rows with gold/silver/bronze placements, "Saved to everyone's game history", gold **Rematch** (spinner; disabled after the first press). Player column stays.
- **Phone, `finished`:** "You finished {placement}", score (🏆 if winner), standings with my row highlighted, "Waiting for {host}: stay for a rematch, or leave.", **Leave** (sends `leave_room`, then goes Home). Buzzer `idle`.
- **Rematch:** the snapshot puts everyone in the lobby; phones show "You're in" with a gold REMATCH label when the previous phase was `finished`.

Key files: `web/src/game/HostGame.tsx`, `FinalStage.tsx`, `PlayerControls.tsx`, `PlayerColumn.tsx`, `web/src/lib/room.ts` (new messages, `clueAnswers`, `overrideReview`, `startedAt`/`finishedAt`), new `web/src/game/OverrideSheet.tsx`, `web/src/game/Scoreboard.tsx`, `web/src/pages/HostLobby.tsx`, `JoinRoom.tsx` (REMATCH label).

### 4. Docs (see "Docs to update")

## Contracts preserved / changed

Changed, additively: two new client messages, two new server messages, optional fields on `game_over` and `room_snapshot`, one new error code. No field removed or renamed, no new required field on an existing message, so the subprotocol stays `schmegettes.v1`. No REST change.

## Success criteria

- Override flips the verdict, records `update_verdict` with `overridden_correct`/`overridden_incorrect` and the new delta, and `game_results` matches the live scores after the game.
- Control after an override follows the rule (latest correct on the clue, else control at pick; DD and Final never move it).
- A phone sending `override_review`, `override_verdict` or `rematch` gets `not_host`; an override outside the window gets `wrong_phase`; an answer from another clue gets `unknown_answer`.
- While the review is open the clock doesn't run; closing resumes it with the time left; a host-device pause closes the review.
- `rematch` from `finished` returns every remaining member to `lobby` at $0, and the next Start builds a board with none of the previous game's revealed clues.
- `leave_room` works in `finished`.
- Clue text and correct responses still reach only the host's sockets; `clueAnswers` only the host copy.

## Test plan

- `game/internal/play`: `override_test.go`: correct→incorrect and back (deltas, scores, records); control recompute (two answers on one clue; override the only correct one; Daily Double keeps control); window bounds (before `clue_ended`, after the 6 s deadline, Final reveal step only); review pause and resume keeps the remaining time; pause while reviewing; same-verdict no-op; `unknown_answer`; `Rematch` only in `finished`.
- `game/internal/room`: routing and `not_host` for each new intent; rematch sends a lobby snapshot to every socket; `leave_room` allowed in `finished`; `UpdateVerdict` retried after a failed write; `clueAnswers` absent from non-host snapshots.
- `supabase/tests/game_history.test.sql`: add a case calling `update_verdict` to `overridden_incorrect` and checking placement, and a rematch after `end_game` (`start_game` succeeds on the reopened room). No migration.
- `web`: `OverrideSheet.test.tsx` (texts, Keep/Mark send the right messages, double press), `Scoreboard.test.tsx` (placements with ties, TIED FOR 1ST, Rematch disabled after press), `PlayerControls.test.tsx` (reviewing text, override result, finished view and Leave), `src/lib/room.test.ts` (reducer for the new messages).

```bash
mise run gen
mise run test:game -- ./internal/play/... ./internal/room/...
mise run db:test
mise run test:web -- src/game/OverrideSheet.test.tsx src/game/Scoreboard.test.tsx src/game/PlayerControls.test.tsx src/game/HostGame.test.tsx src/lib/room.test.ts
```

## Database migration plan

None. `update_verdict`, `end_game` and `start_game` already do what's needed; only pgTAP cases are added.

## Logging requirements

Per `logging-conventions.md`, through the room's logger (`room_id` and `game_id` bound):

| Event | Level | Fields |
|---|---|---|
| `verdict overridden` | info | `answer_id`, `user_id` (the answerer), `from_verdict`, `to_verdict`, `score_delta` |
| `rematch` | info | `members` (count) |
| `update verdict failed` | error | `err`, `answer_id` (retried) |

Rejected intents (`not_host`, `wrong_phase`, `unknown_answer`) are not errors: `debug` at most. Never log the answer text above `debug`, the correct response, tokens, or emails.

## Docs to update

- `docs/system-docs/architecture/realtime-game-server.md`: an "Overrides" section (window, review pause, control rule, records); Rematch in Lobby; `leave_room` in `finished`; the Judging line ("the host can override a verdict on the clue just played or the Final answer being revealed").
- `docs/product-docs/features/scoreboard-and-overrides/*.md`: remove "not yet implemented"; `docs/product-docs/architecture/product-overview.md` if anything changed.
- `docs/system-docs/architecture/api-contract.md`: nothing (no new contract file).

## Branch

`new-feature/design-pass-endgame-impl`, from and into `daily/2026-11-09`. Implementation PR title: `[New Feature] design-pass-endgame: …`.
