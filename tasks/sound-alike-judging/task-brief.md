---
jira-type: enhancement
jira-title: "Accept spoken answers that sound like the correct response, and record why"
---
# Task spec: sound-alike-judging

Product brief: [product-brief.md](./product-brief.md). Product rules and the ✓/✗ table: [gameplay feature brief, "How an answer is matched"](../../docs/product-docs/features/gameplay/feature-brief.md#how-an-answer-is-matched). Override recording: [scoreboard-and-overrides, Host overrides](../../docs/product-docs/features/scoreboard-and-overrides/feature-brief.md#host-overrides).

## Approach

1. The phone asks the recognizer for up to 5 transcripts and sends the extra ones with `submit_answer` (new optional field).
2. `game/internal/judge` gets a `Judge(heard []string, response string) Result` that tries each transcript in order and returns the verdict, the rule that decided it, and which transcript matched. It adds sound-alike matching and spoken-form folding (numbers, accents, abbreviations) after today's rules.
3. The game records the rule, every transcript, and the judge's verdict with each answer. `update_verdict` stamps `overridden_at` on a host override. The judge's verdict is written once and never changes.
4. A documented SQL query lists every overridden answer for tuning.

No new screens. `answer_judged.answer` carries the transcript that matched (or the first one), so the TV verdict line shows it with no web change there.

## Subtasks

### 1. `shared/`: contracts (additive)

- `shared/schemas/protocol/client-message.schema.json`, `SubmitAnswer`: add optional `alternatives`: `{"type": "array", "items": {"type": "string", "maxLength": 200}, "maxItems": 4}`. Description: "Other transcripts the speech recognizer offered, most likely first, after `answer` (which stays its best guess). Voice only; omitted for typed answers and by recognizers that return one transcript. The server judges `answer` first, then each of these."
- `shared/schemas/domain.schema.json`: add `MatchRule`, enum `["exact", "spelling_slip", "sounds_alike", "no_match", "nothing_heard"]`. Description: "Which judging rule decided an answer. Mirrors public.match_rule." Not sent on any socket message; it exists so Go and Postgres share the vocabulary.
- Run `mise run gen`; commit the generated TS, Go (`game/internal/contracts`, `api/internal/contracts` if it changes) and Python output.

### 2. `supabase/`: migration

See "Database migration plan" below.

### 3. `game/internal/judge`: the matcher

Key files: `game/internal/judge/judge.go`, `judge_test.go` (and new files in the package as needed).

API:

```go
type Result struct {
    Correct bool
    Rule    contracts.MatchRule // exact | spelling_slip | sounds_alike | no_match | nothing_heard
    Index   int                 // which transcript decided it; 0 when none matched
}
func Judge(heard []string, response string) Result
func IsCorrect(answer, response string) bool // kept: Judge([]string{answer}, response).Correct
```

Rules, applied to each transcript in order; the first one that matches wins, and its rule is the strongest one it passed:

1. Empty after trimming, for every transcript → `nothing_heard`, incorrect.
2. Normalize as today (case, punctuation, parentheticals, fillers, articles), **plus**:
   - fold accents (`Dvořák` → `dvorak`; `golang.org/x/text` is already an indirect dependency, so promoting it is fine, or a small fold table),
   - expand `st`→`saint`, `mt`→`mount`, `dr`→`doctor` on both sides,
   - spoken numbers → digits on both sides ("eighteen twelve" → `1812`, "nineteen eighty four" → `1984`, "two thousand" → `2000`, "four hundred" → `400`). Numbers then compare **exactly**: no typo or sound leeway on a digit token.
3. Equal → `exact`. Today's one-edit-per-five rule → `spelling_slip`.
4. **Sound-alike** (`sounds_alike`), only when the normalized response has more than 4 letters (excluding spaces) or more than one word:
   - Compare phonetic keys of the whole answer and the whole response with word breaks removed, so "mona lowa" / "maunaloa" / "Mauna Loa" line up. Recommended key: Double Metaphone (primary and alternate codes; accept on any primary/alternate pair).
   - A phonetic match also needs a **spelling-closeness guard** so that unrelated words sharing a key fail: e.g. require the letter edit distance (spaces removed) to be at most about half the response length. "pierce" and "Paris" share a Metaphone key and must stay wrong.
   - Digit tokens must be identical and in the same position.
   - Everything else → `no_match`.

The algorithm is the implementer's choice as long as the tests below pass. **Known tension:** "linkin" → Lincoln needs to tolerate a dropped consonant sound (`LNKN` vs `LNKLN`), while "austria" → Australia (`ASTR` vs `ASTRL`) must fail. If no rule passes every ✓ and ✗ row, stop and bring the failing rows back to `/product`. Don't drop rows or loosen the ✗ cases.

Performance: no allocation-heavy work per call beyond the strings involved; target < 1 ms per `Judge` call with 5 transcripts (benchmark in the test file).

### 4. `game/internal/play` and `game/internal/room`: judging and recording

Key files: `game/internal/play/game.go`, `wager.go`, `override.go`; `game/internal/room/game.go`, `pgstore.go`, `room.go` (Store interface fakes in tests).

- `room/game.go` `submit_answer`: pass `m.Alternatives` through to `play.Game.Answer`. Clip each with the existing `clip`, keep at most 4, drop empty strings. Ignore `alternatives` on typed answers.
- `play.Game.Answer(now, user, clueID, text string, alternatives []string)`; `judge(now, e, heard []string)` where `heard = [text] + alternatives`. The timeout path calls it with `[""]` → `nothing_heard`.
- Use `judge.Judge`. The recorded `Answer`, the in-memory `judged.text`, and `answer_judged.answer` are `heard[Result.Index]`.
- `Record` gains `Rule contracts.MatchRule` and `Heard []string`, set on `RecordAnswer` for clue answers, Daily Doubles and Final (Final: `heard = [typed text]`).
- `PGStore.RecordAnswer` calls the new `record_answer` with `rule` and `heard` (empty `heard` → SQL `null`).
- Overrides: no logic change. `update_verdict` stamps the time (DB side). Add `judge_verdict` and `match_rule` to the existing `verdict overridden` info log. The `judged` struct needs the original verdict and rule for that.

### 5. `web/`: send alternatives

Key files: `web/src/lib/speech.ts`, `web/src/game/useAnswerCapture.ts`, tests `web/src/lib/speech.test.ts`, plus a `useAnswerCapture` test if one exists (add one if not).

- `speech.ts`: `rec.maxAlternatives = 5`. `onFinal?: (text: string, alternatives: string[]) => void`. Alternative *k* is built like today's transcript but from `r[k] ?? r[0]` across results, trimmed. Drop empties and anything equal to `text`, dedupe, keep at most 4. `onInterim` is unchanged (best guess only).
- `useAnswerCapture.ts`: keep the alternatives alongside `finalRef`. `submit` sends `alternatives` only when non-empty (each sliced to 200 chars).
- `VoicePick.tsx` ignores the new argument; no change needed beyond types.
- No UI change.

### 6. Docs

See "Docs to update".

## Contracts

- **Changes (additive, compatible):** `SubmitAnswer.alternatives` (optional) and the new `MatchRule` domain enum. Old phones that don't send `alternatives` are judged on `answer` alone. No subprotocol bump.
- **Preserved:** every server message, including `answer_judged` (its `answer` is now the matched transcript, which is still "what the player said"), `verdict_overridden`, REST, and jobs.

## Database migration plan

`supabase migration new answer_judging` → `supabase/migrations/{timestamp}_answer_judging.sql`:

```sql
create type public.match_rule as enum ('exact', 'spelling_slip', 'sounds_alike', 'no_match', 'nothing_heard');

alter table public.answers
  add column match_rule public.match_rule,          -- null for answers recorded before this
  add column heard text[]                           -- every transcript, most likely first; null before this
    check (heard is null or (cardinality(heard) between 1 and 5
                             and char_length(array_to_string(heard, '')) <= 1000)),
  add column judge_verdict public.verdict           -- the judge's verdict; never changed by update_verdict
    check (judge_verdict is null or judge_verdict in ('correct', 'incorrect')),
  add column overridden_at timestamptz;             -- last host override; null if never overridden
```

- **`record_answer`:** drop the 7-argument function and create it again with two trailing defaulted parameters, `answer_match_rule public.match_rule default null` and `answer_heard text[] default null`. It inserts `judge_verdict = answer_verdict` (when that's `correct`/`incorrect`), `match_rule`, `heard`. Same body otherwise; idempotent as today. Re-apply `revoke all ... from public, anon, authenticated` and `grant execute ... to game_engine` for the new signature.
- **`update_verdict`:** `create or replace` with the same signature (grants kept). Set `overridden_at = now()` when the new verdict is `overridden_correct` or `overridden_incorrect`. Never touch `judge_verdict`, `match_rule`, `heard`.
- **No new table**, so no new RLS policy. `answers_select` (game members) and the table-level `select` grant to `authenticated` already cover the new columns, which matches the product rule ("whoever can read the answer today"). `game_engine`'s table-level insert/update covers them.
- **No backfill.** Existing rows keep nulls in all four columns.
- **Compatible with the running code:** the old game server calls `record_answer` with 7 positional arguments, which resolves to the new function through the defaults, and `update_verdict` keeps its signature. So the migration can run before the new game server deploys. The old server's rows get `judge_verdict` but null `match_rule`/`heard`.
- **pgTAP:** new `supabase/tests/answer_judging.test.sql` (pattern from `gameplay.test.sql`):
  1. `record_answer` with rule and heard stores both, plus `judge_verdict = verdict`.
  2. The 7-argument call still works and leaves `match_rule`/`heard` null.
  3. `update_verdict(..., 'overridden_correct', ...)` sets `overridden_at` and leaves `judge_verdict` alone; flipping back (`overridden_incorrect` after `overridden_correct`) still leaves `judge_verdict` as first recorded.
  4. `heard` with 6 entries is rejected by the check.
  5. A game member can read the new columns; a non-member can't read the row (existing policy, one assertion).
  6. `authenticated` can't execute `record_answer` or `update_verdict` (new signature).

## Tuning query

Document in `docs/system-docs/operations/judge-tuning.md` (new; run as the owner in the SQL editor):

```sql
select a.overridden_at, c.correct_response, a.heard, a.answer, a.match_rule,
       a.judge_verdict, a.verdict, a.source
from public.answers a
join public.board_clues b on b.id = a.board_clue_id
join public.clues c on c.id = b.clue_id
where a.judge_verdict is not null
  and a.verdict in ('overridden_correct', 'overridden_incorrect')
order by a.overridden_at desc;
```

Note in the doc: overridden to correct after `no_match` = judge too strict; overridden to incorrect after `sounds_alike`/`spelling_slip` = too generous. The query must be run and shown in the PR against a local game with at least one override.

## Success criteria

From the product brief, made testable:

1. Every ✓ row in the gameplay feature brief's table is `Correct`, and every ✗ row is incorrect, with the expected `Rule`.
2. Every existing `judge_test.go` case keeps its verdict.
3. Extra false-positive guards stay incorrect: ("pierce", "Paris"), ("mel", "Mali"), ("eighteen twenty one", "1812"), ("paris or london", "Paris").
4. `Judge(["sane river", "seine river"], "Seine River")` is correct via either transcript; `Judge(["lyon", "paris"], "Paris")` is correct with `Index = 1`, and the recorded and broadcast answer is "paris".
5. `submit_answer` without `alternatives` is judged exactly as today.
6. A 9 s silence records `nothing_heard`; a typed Final answer records its rule and `heard = [text]`.
7. After an override: `judge_verdict`, `match_rule` and `heard` unchanged, `overridden_at` set; after a flip and flip back, `judge_verdict` is still the judge's.
8. Scores, `game_results`, stats and history unchanged (they read `verdict`/`score_delta` only).
9. The tuning query returns the overridden answer.

## Test plan

| Package | Tests | Command |
|---|---|---|
| shared | regenerate; commit output | `mise run gen` |
| game: judge | table test covering the feature-brief ✓/✗ table, criteria 2–4, numbers, accents, abbreviations, short-word rule, `nothing_heard`; `BenchmarkJudge` | `mise run test:game -- ./internal/judge/...` |
| game: play | `Answer` with alternatives (matched index recorded and broadcast); timeout → `nothing_heard`; Final records rule and heard; override keeps the original rule/verdict in the log record | `mise run test:game -- ./internal/play/...` |
| game: room | `submit_answer` passes clipped `alternatives` (5 sent → 4 kept; empty dropped; typed ignores them); store fake receives `Rule`/`Heard` | `mise run test:game -- ./internal/room/...` |
| web | `speech.test.ts`: alternatives built, deduped, capped, top excluded; `useAnswerCapture` sends `alternatives` only when present | `mise run test:web -- src/lib/speech.test.ts` and the `useAnswerCapture` test file |
| db | `answer_judging.test.sql` above | `mise run db:test` |

By hand (Phase C): on Chrome (Android or desktop) and an iPhone, say "Seine" and "Mauna Loa" to a test clue, and check the TV verdict and the stored `heard`. Note whether iOS Safari returns more than one transcript. That answers the product brief's open question.

## Logging requirements

- `game`: one `debug` line per judged answer, `answer judged`, with `room_id`, `game_id`, `user_id`, `answer_id`, `verdict`, `match_rule`, `heard_count`, `matched_index`. **No transcript text** above `debug`, and none in this line at all.
- Existing `info` `verdict overridden` gains `judge_verdict` and `match_rule`. Still never the answer text.
- A wrong answer is gameplay, not an error (§3). No tokens, emails or whole messages (§5).

## Docs to update

- `docs/product-docs/features/gameplay/feature-brief.md` and `interaction-design.md`: remove "Not yet implemented" from the sound-alike, several-hearings and recording rules once built, and fix any rule that changed.
- `docs/product-docs/features/scoreboard-and-overrides/feature-brief.md`: "Recorded" bullet, drop "Not yet implemented."
- `docs/system-docs/architecture/realtime-game-server.md`: "Judging" (new rules, `alternatives`), "Recording" (`record_answer` signature, `update_verdict` stamps `overridden_at`), "Overrides" (log fields).
- `docs/system-docs/architecture/data-and-isolation.md`: the new `answers` columns and `match_rule` enum.
- `docs/system-docs/operations/judge-tuning.md`: new, with the tuning query.

## Branch
`enhancement/sound-alike-judging-impl`, from and into `daily/2026-11-10`. No Jira ticket: Jira setup is not done for this repo (development-workflow.md, "Jira setup"), so the folder stays `tasks/sound-alike-judging/` and PR titles use `sound-alike-judging` in place of `SCH-{N}`.
