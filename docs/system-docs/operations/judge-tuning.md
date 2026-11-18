# Judge Tuning

**Source of truth:** `game/internal/judge/`, `supabase/migrations/20261110203638_answer_judging.sql`

How to find answers the judge got wrong, so its rules ([how an answer is matched](../../product-docs/features/gameplay/feature-brief.md#how-an-answer-is-matched)) can be tuned. Host overrides are the signal: each one is a verdict a person disagreed with.

## The overridden answers

Run as the owner in the Supabase SQL editor (production) or `psql` (local):

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

## Reading it

| Judge said | Host changed it to | Means |
|---|---|---|
| `incorrect`, `no_match` | `overridden_correct` | Too strict. Look at `heard`: a sound-alike or spelling the rules should accept |
| `incorrect`, `nothing_heard` | `overridden_correct` | The microphone or recognizer, not the rules |
| `correct`, `sounds_alike` or `spelling_slip` | `overridden_incorrect` | Too generous. A ✗ case for `judge_test.go` |
| `correct`, `exact` | `overridden_incorrect` | The catalog's response, or the host's call; not the rules |

An answer flipped and flipped back shows `verdict = overridden_*` matching its `judge_verdict`; it was not a disagreement in the end.

A rule change adds the case to `TestJudgeRules` in `game/internal/judge/judge_test.go` first, with the product docs' ✓/✗ table kept in step. Answers recorded before 2026-11-10 have no `judge_verdict` and don't appear.
