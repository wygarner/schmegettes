---
task-type: enhancement
task-title: "More lenient answering: same words in any order or form, silent first letters, more time to begin and no cut-off at a pause"
---
**Task Type:** Enhancement to gameplay (answer judging and listening). Wyatt (2026-11-28): "In general, the answer matching needs to be more lenient." QA (production, 2026-11-28): "cave exploration" for **Exploring Caves** was wrong; "knee" vs "nee" wasn't caught; "Add more grace for not speaking the answer", which means both more time to begin answering and not being cut off by a pause (Wyatt, 2026-11-28).

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md` (Answering and judging; How an answer is matched), `features/gameplay/interaction-design.md` (Timing), `features/wagers/interaction-design.md` (Timing). All updated in the qa-2026-11-28 docs change.

**Problem:**
- Every rule compares the whole response in order. The same words in a different order or form ("cave exploration" / Exploring Caves, "battle of hastings" / Hastings, Battle of) are judged wrong.
- Short responses (4 letters or fewer) use only the spelling rule, which needs the same first letter. Silent first letters always fail: "nee" for Knee, "rap" for Wrap.
- Listening stops at the player's first pause (`continuous = false` in `web/src/lib/speech.ts`). A player who hesitates, or says "um, what is…", gets **nothing heard** long before 9 s.

**Outcomes:** Players are marked right when they clearly knew it, and nobody loses a clue for pausing to think.

**Player flow:**
- **Answer time, in two stages** (replaces one 9 s window from the buzz):
  - **The clock starts when the microphone is listening.** The winner's device reports when its recognizer has started. The server waits at most 2 s for that, then starts the clock anyway. Today the clock starts at the buzz, so microphone start-up and the iPhone's dictation chime eat a second or two.
  - **Up to 10 s to begin.** Beginning means a word other than a filler ("um", "uh", "er", "what is", "who is", "what are", "who are").
  - **Once begun, up to 6 s to finish**, ending earlier after 1.5 s of quiet. The longest possible answer is 16 s; a quick answer is judged as fast as today.
  - If the recognizer stops on its own (a pause), it's restarted at once, and what was heard so far is kept.
  - **TV:** the countdown bar shows "Answer now" for the 10 s, then switches to a shorter "Finishing…" bar once the player has begun. The live transcript keeps updating.
  - **Phone:** the same two stages, under the listening indicator.
  - **The server enforces both limits** (10 s with no begun-answer report, 6 s after it). It can't hear, so the phone reports "begun" with its first non-filler partial transcript.
  - Daily Doubles use the same two stages. Buzz windows stay 9 s. A disconnect during the answer is unchanged (no penalty, buzzing reopens).
- **Judging,** a new rule **same words**, after exact, spelling slip and sounds alike:
  - Both sides are cut into words, without small linking words (of, and, in, on, to, for, with) and articles.
  - Each word is reduced to its stem: plurals and the endings -s, -es, -ing, -ion, -ation, -ed, -er don't matter ("exploration", "exploring", "explore" are the same).
  - Correct when every response word has a matching answer word, in any order, and the answer has no extra meaningful word. A pair of words matches if their stems are equal, or one is a spelling slip of the other, or they sound alike, with the existing guards per word.
- **Silent first letters:** kn/n, gn/n, wr/r, ps/s and wh/w at the start of a word count as the same, in every rule, short responses included.
- **Examples:** see the table in the gameplay feature brief. ✓ "cave exploration" / Exploring Caves, "nee" / Knee. ✗ "cave" / Exploring Caves (missing word), "northern ireland" / Ireland (extra word), "russia" / Prussia (still a different word).
- **Recorded** as match rule `same_words` (new). Override data shows whether it's too generous.
- **Final Schmegettes** typed answers use the same rules. The answer-time change doesn't apply there (Final is typed).

**Success Criteria:**
- Every ✓ and ✗ row in the gameplay feature brief's tables passes as a judge test (`game/internal/judge/judge_test.go`), including all existing rows.
- Before shipping, replay every production answer recorded as `overridden_correct` or `overridden_incorrect` through the new judge, and report how many it now gets right and any new wrong passes. Use the owner database, run by Wyatt or the workflow, with no names or emails in the output. No `overridden_incorrect` answer may newly pass.
- Judging stays instant: p95 judge time under 1 ms in the judge benchmark.
- Listening: a unit test with a stubbed recognizer that ends after 2 s of silence before any words keeps listening. Saying "um" and then the answer at 8 s is judged on the answer. Silence for 10 s is **nothing heard**. Speaking for more than 6 s is cut off at 6 s.
- Game server tests: the clock starts at the listening report, or at 2 s without one. Nothing begun by 10 s gives no answer. Begun, then 6 s gives judging on the last transcript received.
- Contract: a new client message for "listening" and "begun" (or fields on the existing answer progress message), and the two deadlines on the answering state. This is a contract change in `shared/`.
- `MatchRule` gains `same_words`. This is a contract change in `shared/`.

**Out of scope:** a language-model judge (`llm-answer-judge`), synonyms ("Big Apple" for New York City), buzz window length, a timer setting in the lobby.

**Decision needed (Wyatt):** the numbers. 10 s to begin and 6 s to finish are proposed. Alternative: one longer window of 12 s from when the microphone is listening, which is simpler to show but lets a slow speaker ramble.
