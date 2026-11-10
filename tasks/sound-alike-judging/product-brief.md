---
jira-type: enhancement
jira-title: "Accept spoken answers that sound like the correct response, and record why"
---
**Task Type:** Enhancement. It extends the existing answer judge in gameplay; no new screens or flows.

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md` ("How an answer is matched") and `interaction-design.md` (Edge cases); `features/scoreboard-and-overrides/feature-brief.md` (Host overrides, "Recorded").

**Problem:** The judge forgives spelling slips (one letter per five) but not words that sound alike. Speech-to-text often writes a right answer the way it sounds, so players who said the right thing lose points. This breaks the "generous judging" principle in the product overview, and the host has to override often. Run against today's judge (`game/internal/judge`), all of these are marked wrong:

| Heard as | Correct response |
|---|---|
| "mona lowa" | Mauna Loa |
| "linkin" | Lincoln |
| "sane" | Seine |
| "neechee" | Nietzsche |
| "war of eighteen twelve" | War of 1812 |
| "dvorak" | Dvořák |
| "st louis" | Saint Louis |

Contributing cause: the phone keeps only the recognizer's single best guess (`maxAlternatives = 1` in `web/src/lib/speech.ts`), so a right answer the recognizer heard as its second guess is thrown away.

We also can't tell how often the judge is wrong. An answer records only its final verdict: nothing says which rule decided it, and a host override overwrites the verdict in place (`update_verdict`), with no time and no record of the judge's original verdict once a verdict is flipped and flipped back. The overrides doc says the original verdict is recorded; that's only true for a single flip.

**Outcomes:**
- A player who says the right answer is marked correct even when it's transcribed as a sound-alike spelling.
- Wrong answers stay wrong: a different word that shares sounds doesn't pass.
- Verdicts stay instant, and nothing changes on screen.
- For every judged answer we can see why it was judged that way and whether the host overruled it, so we can find answers the judge gets wrong and tune the rules.

**Player flow:**
- No new states, timers or UI. Buzz, speak, judged, as today.
- **Matching rules** (full table in the feature brief):
  - An answer that sounds like the **whole** correct response, in order, is correct, however it's spelled or split into words ("mona lowa", "maunaloa").
  - Numbers said as words match digits ("eighteen twelve" = 1812), but must be the same number.
  - Accents don't matter (Dvořák = dvorak). Common abbreviations match their full form: St/Saint, Mt/Mount, Dr/Doctor.
  - One-word responses of 4 letters or fewer (Zeus, Oslo, Ra) keep today's spelling rule, because short words sound like too many others.
  - Today's rules stay: "What is" optional, articles and parenthetical hints ignored, one typo per five letters.
- **Several hearings:** the phone sends the recognizer's top few transcripts (up to 5) with the final answer. The answer is correct if any of them matches. The TV verdict line and the game history record the transcript that matched, or the most likely one when none did. Interim transcripts are unchanged (best guess only).
- **Final Schmegettes** (typed) uses the same matcher, so a phonetic spelling of the right answer counts. Typed answers have one transcript.
- **Recorded with every judged answer** (regular clues, Daily Doubles, Final), as it's judged:
  - the rule that decided it: **exact**, **spelling slip**, **sounds alike**, **no match**, or **nothing heard** (empty transcript, including a 9 s silence)
  - every transcript the phone heard, most likely first
- **Recorded when the host overrides:**
  - the judge's original verdict and rule, which never change
  - the current verdict (as today: `overridden_correct` / `overridden_incorrect`) and score change
  - when the host last changed it
  - Flip and flip back: the answer still shows it was overridden, and the judge's original verdict is intact.
- None of this is shown in any UI. Players and the host see exactly what they see today. Who can read these fields: whoever can read the answer today.
- **Edge cases:**
  - A phone or browser that returns only one transcript (or an older client that doesn't send alternatives): judged on that one, as today.
  - Alternatives can't help a player cheat: they come from the player's own recognizer and only one answer is judged per attempt.
  - Host overrides work as today; only what's recorded changes.
- Answers recorded before this ships have no rule or transcript list. They are left empty, not guessed.

**Success Criteria:**
- Every ✓ row in the feature brief's table is judged correct and every ✗ row is judged incorrect, as automated tests on the judge.
- Every case in today's `judge_test.go` keeps its verdict.
- A transcript list where only the second entry matches is judged correct, and the recorded answer is that second entry.
- An answer message without alternatives is judged exactly as today.
- Judging adds no network call and no noticeable delay (well under 10 ms per answer).
- Every judged answer in a test game has its rule and transcripts recorded, including a 9 s silence (**nothing heard**) and a typed Final answer.
- After a host override, the answer shows the judge's original verdict and rule, the new verdict, and when it changed. After a flip and a flip back, the original verdict is still the judge's.
- One documented query lists every overridden answer with the correct response, every transcript heard, the rule, the judge's verdict, the final verdict, and when it changed. This is the list we tune from.
- Scores, stats and game history are unchanged: they still use the current verdict and score change.

**Out of scope:**
- Partial answers: last name only ("Lincoln" for Abraham Lincoln when not in parentheses), "Everest" for Mount Everest, "Cleopatra" for Cleopatra VII.
- Extra words around the answer ("I think it's Paris", "um, Paris").
- An LLM second opinion or appeals (the worker's appeal judge).
- Spoken clue picks (`web/src/lib/pickByVoice.ts` has its own matcher).
- Languages other than English.
- A dashboard or report screen for judge accuracy (the query is enough for now).
- Using the recorded data to tune rules automatically.
