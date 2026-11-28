---
task-type: enhancement
task-title: "An override to correct ends the clue: later answers on it don't count"
---
# Task spec: override ends the clue

Product brief: [product-brief.md](product-brief.md) (decided: option 1). Rules: `docs/product-docs/features/scoreboard-and-overrides/feature-brief.md` (Host overrides) and `interaction-design.md` (Edge cases).

## How it works today

`play.Game.Override` (`game/internal/play/override.go`) flips one answer's verdict and score, then gives control to the latest correct answer on the clue. Later answers keep their verdicts, so after "Bob ✗ → Alice ✓ → override Bob ✓" both gain the value. Each change is one `verdict_overridden` and one `UpdateVerdict` record (`public.update_verdict`).

## Subtasks

### 1. `shared/` and `supabase/`: a `voided` verdict

- `shared/schemas/domain.schema.json` `Verdict`: add `voided` ("an answer after an earlier answer was overridden to correct; it scores 0"). Update the description.
- `verdict_overridden` (server message) gains an optional `voided` array. Each item is `{answerId, userId, verdict, scoreDelta}`, one per later answer whose verdict or score changed with this override (voided, or restored). `scores` and `controllingUserId` already carry the totals.
- Run `mise run gen` and commit the output.
- Migration `supabase migration new voided_verdict`: `alter type public.verdict add value 'voided';`. `public.update_verdict` takes any `public.verdict`, so it needs no change. `stats_and_leaderboard` counts only the four known verdicts, so a voided answer is neither right nor wrong in stats. pgTAP: `supabase/tests/voided_verdict.test.sql` checks `update_verdict` accepts `voided` with delta 0, and that a voided answer isn't counted in the stats function's right or wrong totals.
- Compatible with running code: an added enum value; the old game server never writes it.

### 2. `game/`: the override ends the clue

In `play.Game.Override`, on a regular clue (`stepClueEnd`, not a Daily Double, not Final):

- **To correct:** every answer **after** this one in `g.clueAnswers` (chronological) that isn't already `voided` saves its current `verdict` and `delta` (new `judged` fields `prevVerdict`, `prevDelta`). It then becomes `voided` with delta 0, and its score change is undone (`g.scores[x.user] -= x.delta`). Control goes to the overridden player.
- **Back to incorrect:** every `voided` answer after this one gets its saved verdict and delta back, with scores re-applied. Control follows today's rule: the latest correct answer, or whoever had control at the pick.
- **A `voided` answer can't be overridden:** reject with a new error code `answer_voided` (add it to the `ErrorCode` enum in the server schema).
- One `UpdateVerdict` record per changed answer, the overridden one first, so the database matches. Each record keeps its `JudgeVerdict` and `Rule`.
- One `verdict_overridden` carries the overridden answer and the `voided` list.
- `overrideSnapshot` lists voided answers with their verdict, so the host sheet can grey them out after a reconnect.
- Daily Double and Final: unchanged (one answer each).

### 3. `web/`

- `web/src/lib/room.ts`: `verdict_overridden` applies the `voided` list to `answers`, and `lastOverride` for the current user if they're in it.
- `isCorrect` stays `correct` / `overridden_correct` only. Add `isVoided(verdict)`.
- Verdict rows (`OverrideSheet.tsx`, `VerdictRow` on the TV): a voided answer shows a grey **DOESN'T COUNT** chip and "$0", and its override control is disabled with the label "Doesn't count".
- The voided player's phone shows "Doesn't count: the host overrode an earlier answer." with "$0" (`PlayerControls`), in place of the verdict line.
- Scoreboard and My games: no change. Totals are sums of `score_delta`.

## Key files

| Subtask | Files |
|---|---|
| 1 | `shared/schemas/domain.schema.json`, `shared/schemas/protocol/server-message.schema.json`, generated files, `supabase/migrations/<ts>_voided_verdict.sql`, `supabase/tests/voided_verdict.test.sql` |
| 2 | `game/internal/play/override.go`, `game/internal/play/override_test.go` |
| 3 | `web/src/lib/room.ts`, `web/src/lib/room.test.ts`, `web/src/game/OverrideSheet.tsx`, its test, `web/src/game/PlayerControls.tsx`, its test |

## Contracts

Changed, additively:

- `Verdict` gains `voided`
- `verdict_overridden` gains `voided`
- `ErrorCode` gains `answer_voided`

An old web client would show a `voided` verdict as not correct. Web and game deploy together.

## Success criteria

- Bob ✗, Alice ✓, then the override makes Bob ✓: Bob +v, Alice 0 (**DOESN'T COUNT**), control Bob. Overriding Bob back to ✗: Bob −v, Alice +v, control Alice.
- Bob ✗, Carol ✗, override Bob ✓: Bob +v, Carol 0 (her −v given back).
- Overriding a voided answer gives `answer_voided`.
- The database's answers match: `update_verdict` is called for every changed answer, and a reloaded game (recovery) has the same scores.
- Stats: a voided answer is neither right nor wrong.

## Test plan

- `mise run test:game -- ./internal/play/...`: the success criteria, plus flipping twice, a Daily Double unchanged, records in order, and a snapshot listing voided answers.
- `mise run db:test`: `voided_verdict.test.sql`.
- `mise run test:web -- src/lib/room.test.ts src/game/OverrideSheet.test.tsx src/game/PlayerControls.test.tsx`.
- `mise run gen`, and commit the output.
- **Agent QA (local stack):** host plus two phones; Bob says a wrong answer, Alice a right one, the host overrides Bob. Check the TV and both phones. Record it on the PR.

## Database migration plan

- `supabase migration new voided_verdict`: `alter type public.verdict add value 'voided';`
- No table, RLS or grant changes.
- pgTAP as above.
- Compatible with the code already running.

## Logging requirements

`INFO "verdict overridden"` (existing, if present; otherwise add it in `room`) gains `voided_count`. No answer text above `debug`.

## Docs to update

- `docs/product-docs/features/scoreboard-and-overrides/feature-brief.md` and `interaction-design.md`: remove **Not yet implemented** (`override-ends-clue`)
- `docs/system-docs/architecture/realtime-game-server.md`: the Overrides section (voiding and restoring, `answer_voided`)
- `docs/system-docs/architecture/data-and-isolation.md`: if it lists verdict values, add `voided`
