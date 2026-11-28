---
task-type: enhancement
task-title: "More lenient answering: same words in any order or form, silent first letters, more time to begin and no cut-off at a pause"
---
# Task spec: lenient judging

Product brief: [product-brief.md](product-brief.md) (decided: 6 s to begin, 6 s to finish). Rules: `docs/product-docs/features/gameplay/feature-brief.md` (Answering and judging; How an answer is matched), `features/gameplay/interaction-design.md` and `features/wagers/interaction-design.md` (Timing).

This is one task with two parts that ship together: **judging** (game server only) and **answer time** (contract, game server and web). The parts are independent: the implementation may use two commits, or two PRs that both reference GH-N with the second removing the task folder.

## Part A: judging

### A1. `game/internal/judge`: the `same_words` rule and silent first letters

**Silent first letters.** In `normalize`, after accent folding, rewrite each word's start: `kn`→`n`, `gn`→`n`, `wr`→`r`, `ps`→`s`, `wh`→`w`. Apply it to both sides, so every rule sees "nee" and "knee" as `nee`. Add a guard: a word of 2 letters or fewer isn't rewritten ("ps" stays).

**`same_words`**, checked after `sounds_alike` fails, in `match`:

1. Split both normalized strings into words. Drop articles (already gone) and the linking words `of and in on to for with at by from the` (configurable list in `judge.go`).
2. Stem each word with a small suffix stripper (new `stem.go`). Longest suffix first: `ations ation ings ing ions ion ers er ies ied es ed s` → strip, then `ie`→`y` and drop a trailing `e`, keeping at least 3 letters. So "exploration", "exploring", "explore" and "explored" all become `explor`, and "caves" and "cave" both become `cav`. Numbers aren't stemmed.
3. Correct when the multisets match one-to-one: every response word pairs with a distinct answer word, and no answer word is left over. Two words pair when their stems are equal, **or** one is a spelling slip of the other (the existing per-word rule: ≤1 edit per 5 letters, same first letter), **or** they sound alike (equal `phoneticKey`, plus the existing 60% spelling guard, and not for words of 4 letters or fewer).
4. Responses of one word never use `same_words` (the existing rules already cover them), so "russia" / Prussia stays wrong.
5. Numbers keep today's rule: `digits(a) == digits(r)` must hold first.

Pairing is a small bipartite match: responses are short, so greedy pairing on exact stem first, then slips, then sounds, is enough. Add a test where greedy order matters.

`contracts.MatchRule` gains `same_words` (subtask C1).

### A2. Check against real overrides before shipping

Add `game/cmd/judgereplay`: it reads CSV (`heard,response,judge_verdict,final_verdict`) on stdin, re-judges each row, and prints counts only. The counts are: newly correct, newly correct where the host had overridden to correct (good), newly correct where the host had overridden to **incorrect** (bad, must be 0), and newly incorrect (must be 0). It never prints the answers.

The PR body includes the SQL Wyatt runs against production with the owner URL to export that CSV. It selects answers with an `overridden_*` verdict, joining the clue's response, and outputs no names, ids or emails. Wyatt pastes the counts into the PR before it merges.

## Part B: answer time

### B1. `shared/`

- New client message `answer_status`: `{type, clueId, status: "listening" | "begun"}`. Description: "The answering player's device started listening (listening), or heard the first word that isn't a filler (begun). Drives the two answer stages."
- `phase_changed` and `room_snapshot` gain optional `answerStage: "begin" | "finish"` (present in `answering`, and during a Daily Double answer).
- `MatchRule` gains `same_words`.
- Run `mise run gen` and commit the output.

### B2. `game/internal/play`

Replace the single answer deadline (`now + answerWindow + AnswerGrace`) with stages. New constants: `ListenWait = 2 s`, `AnswerBegin = 6 s`, `AnswerFinish = 6 s`. `AnswerGrace` (1.5 s for the final transcript to arrive) stays on each stage's deadline.

- **Buzz won (or Daily Double answer starts):** stage `begin`. The deadline is `now + ListenWait + AnswerBegin + AnswerGrace`, a cap in case no `listening` comes.
- **`answer_status listening`** from the answering player, same clue, stage `begin`, the first time: deadline becomes `now + AnswerBegin + AnswerGrace`, but never later than the cap.
- **`answer_status begun`** in stage `begin`: stage becomes `finish`, and the deadline becomes `now + AnswerFinish + AnswerGrace`.
- Each change re-sends `phase_changed` (same phase, new `deadlineAt` and `answerStage`), so the TV and phones redraw the countdown.
- **Deadline in `begin`:** no answer heard (incorrect, as today's silence). **Deadline in `finish`:** the last `answer_progress` text is judged as the answer. Today the deadline means "nothing heard", so keep the latest progress text per answer (`g.lastProgText`).
- `submit_answer` at any stage judges at once, as today.
- `answer_status` from anyone but the answering player, or for another clue, is ignored (`ErrIgnored`, no error to the client).
- Pause and resume: the answering player is cleared as today, so stages restart with the re-read.
- `answerWindowMs` in the snapshot becomes `AnswerBegin` (kept for older clients). `Windows(pace)` keeps the buzz window; the pace no longer changes the answer time.

### B3. `web/`

- `web/src/lib/speech.ts`: the browser recognizer listens until told to stop. Use `continuous = true` where the browser supports it. When the browser ends recognition on its own (`onend` not caused by `stop()` or `abort()`), restart it at once and keep the transcript heard so far, prefixing it to the new segment. Add an `onStart` callback (already there) and a `stop()` that finishes with the joined transcript.
- `web/src/game/useAnswerCapture.ts`:
  - On the recognizer's `onStart`, once this player has won: send `answer_status listening`.
  - On the first interim transcript that has a word outside the fillers (`um uh er erm hmm what who where is are was`): send `answer_status begun`.
  - After begun, stop 1.5 s after the last interim change (a quiet timer, reset on every interim), then submit.
  - Remove the old cap timer (`answerMs`). The server's deadline (`deadlineAt`) is the cap, and on the `finish` deadline the server judges the last progress text. The phone also stops when `phase` leaves `answering`.
- `web/src/game/timing.ts`: `ANSWER_BEGIN_MS = 6000`, `ANSWER_FINISH_MS = 6000`. The countdown on the TV (`ClueView`) and the phone takes its total from `answerStage`, and draws from `deadlineAt` as today. Labels: "Answer now" in `begin`, "Finishing…" in `finish`.
- `web/src/lib/room.ts`: store `answerStage` from `phase_changed` and `room_snapshot`.

## Key files

| Part | Files |
|---|---|
| A1 | `game/internal/judge/judge.go`, new `stem.go`, `judge_test.go` |
| A2 | new `game/cmd/judgereplay/main.go`, `main_test.go` |
| B1 | `supabase/migrations/<ts>_match_rule_same_words.sql`, its pgTAP test, `shared/schemas/protocol/client-message.schema.json`, `server-message.schema.json`, `shared/schemas/domain.schema.json` (`MatchRule`), generated files |
| B2 | `game/internal/play/game.go`, `game_test.go`, `wager.go` (Daily Double answer), `wager_test.go`, `game/internal/room/game.go` (route `answer_status`) |
| B3 | `web/src/lib/speech.ts`, `web/src/game/useAnswerCapture.ts`, `web/src/game/timing.ts`, `web/src/lib/room.ts`, the countdown in `HostGame.tsx` / `PlayerControls.tsx`, and their tests |

## Contracts

Changed, additively:

- new client message `answer_status`
- `answerStage` on `phase_changed` and `room_snapshot`
- `MatchRule` gains `same_words`

Web and game deploy together. An old phone never sends `answer_status`, so it gets the cap: 2 + 6 s, then judging of its last progress text.

## Success criteria

- Every ✓ and ✗ row in the gameplay feature brief's tables passes as a judge test, old and new. Also: "exploreing cave" / Exploring Caves ✓, "rap" / Wrap ✓, "battle of hastings" / "Hastings, Battle of" ✓, "cave" / Exploring Caves ✗, "northern ireland" / Ireland ✗, "eighteen twelve war" / War of 1812 ✓, "war of 1813" / War of 1812 ✗.
- The `judgereplay` counts are in the PR: 0 newly correct among `overridden_incorrect`, and 0 newly incorrect.
- Judge benchmark (`BenchmarkJudge`, add it): p95 under 1 ms on a 6-word response.
- With a player who says nothing for 5 s, then "um", then the answer at 5.5 s, the answer is judged on the answer. Silence for 6 s after listening starts gives **nothing heard**. Speaking for 8 s is cut at 6 s after the first word, and the last progress text is judged.
- Quick answers ("Paris", said at once) are judged as fast as today.

## Test plan

- `mise run test:game -- ./internal/judge/... ./cmd/judgereplay/... ./internal/play/... ./internal/room/...`
  - judge tables and pairing order
  - the benchmark (`go test -bench Judge ./internal/judge/`)
  - stages on a fake clock: cap without `listening`, `listening` then silence, `begun` then deadline judging the last progress text, `submit_answer` early, `answer_status` from the wrong user ignored, Daily Double stages, pause mid-stage
- `mise run test:web -- src/lib/speech.test.ts src/game/useAnswerCapture.test.ts src/lib/room.test.ts src/game/HostGame.test.tsx src/game/PlayerControls.test.tsx`: a fake recognizer that ends after silence is restarted; fillers don't count as begun; the quiet timer submits 1.5 s after the last words; `answer_status` messages are sent once each.
- `mise run db:test`: the new pgTAP test.
- `mise run gen`, and commit the output.
- **E2E:** `e2e/tests/critical-path.spec.ts` uses `__e2e.say`. Check that E2E mode still submits through the real path with the new stages. It should, since `say` produces interim and final transcripts; adjust if not.
- **Agent QA (local stack):** buzz, wait 4 s, then say the answer; and "cave exploration" for a clue whose response is "Exploring Caves" (a local clue fixture). Record both on the PR.
- **Human checklist:** a real phone's microphone with a pause mid-answer.

## Database migration plan

`public.match_rule` is a Postgres enum (`20261110203638_answer_judging.sql`).

- `supabase migration new match_rule_same_words`: `alter type public.match_rule add value 'same_words';`
- pgTAP `supabase/tests/match_rule_same_words.test.sql`: recording an answer with `same_words` works.
- No table, RLS or grant changes. Compatible with the code already running: an added enum value that the old server never writes.

## Logging requirements

- The existing `"answer judged"` log line gains nothing new besides `rule = same_words`.
- `answer_status` is logged at `debug` with `user_id`, `status` and `game_id`. No transcripts above `debug`.

## Docs to update

- `docs/product-docs/features/gameplay/feature-brief.md`, `interaction-design.md`, `features/wagers/interaction-design.md`, `features/lobby/feature-brief.md`: remove **Not yet implemented** (`lenient-judging`), and make the lobby line say "6 s to begin and 6 s to finish".
- `docs/system-docs/architecture/realtime-game-server.md`: the judge rules paragraph (`same_words`, silent letters) and the answering stages (`answer_status`, `answerStage`, the deadlines).
