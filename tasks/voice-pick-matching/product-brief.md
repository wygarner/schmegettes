---
task-type: bug-fix
task-title: "Spoken picks: match how players actually say a category"
---
**Task Type:** Bug Fix. Production QA (2026-11-22): "Matching spoken clues on the board failed often." The rules for what a spoken pick accepts haven't changed: [gameplay feature brief](../../docs/product-docs/features/gameplay/feature-brief.md#the-board-and-control) ("matches the category even with small slips"). The matcher in `web/src/lib/pickByVoice.ts` falls short of them.

**Problem:** A player in control presses the buzzer and says "Tennis for 200". The board has SOUNDS LIKE TENNIS, and nothing else is about tennis, but the phone says "Didn't catch the category." Players shorten categories the way they would at a real game, and today's matcher requires at least 60% of the category's words, whatever else is on the board. Category names are long: in season 38, 30% of categories have more than three words ("& THE BEST SUPPORTING ACTOR OSCAR GOES TO..."). Speech-to-text also writes numbers in ways the matcher doesn't expect, and the phone's other hearings, which spoken answers already use, are thrown away for picks.

Measured against the current matcher (one board, typical transcripts):

| Said (as transcribed) | Board category | Today | Should be |
|---|---|---|---|
| "tennis for 200" | SOUNDS LIKE TENNIS | Didn't catch the category | SOUNDS LIKE TENNIS $200 |
| "supporting actor for 400" | & THE BEST SUPPORTING ACTOR OSCAR GOES TO... | Didn't catch the category | that category, $400 |
| "Oscar for 400" | same | Didn't catch the category | that category, $400 |
| "capitals for one thousand" | WORLD CAPITALS | Didn't catch the category | WORLD CAPITALS $1,000 |
| "twentieth century for 800" | THE 20TH CENTURY | Didn't catch the category | THE 20TH CENTURY $800 |
| "eighties music for 600" | '80S MUSIC | Didn't catch the category | '80S MUSIC $600 |
| "Science 4400" ("for 400" run together) | SCIENCE | Didn't catch the amount | SCIENCE $400 |
| "Science for 4:00" (heard as a time) | SCIENCE | Didn't catch the amount | SCIENCE $400 |
| "science for 4 hundred" | SCIENCE | Didn't catch the amount | SCIENCE $400 |
| "signs for 400" (top hearing; "science" was the 2nd) | SCIENCE | Didn't catch the category | SCIENCE $400 |

What already works and must keep working: "Science for 400", "science for $400", "sciences for 400", "U.S. presidents for $200", "presidents for 200", "4 letter words for 800", "before and after for 200", "St./Saint Louis Blues", "P in the USA", "World War 2 / two" for WORLD WAR II.

**Outcomes:**
- A player can say **any part of a category name that only one category on the board fits**, and get that category.
- Common speech-to-text spellings of the amount pick the right clue.
- When the top hearing doesn't make a pick, the phone's other hearings get a chance, as they do for answers.
- A pick that really is unclear still fails with the same messages, and never picks the wrong clue.

**Player flow:** unchanged: press the buzzer, say the pick, the clue is picked with no confirmation, or the phone says what it missed and the player tries again or taps ([interaction design](../../docs/product-docs/features/gameplay/interaction-design.md)). What changes is what counts as a match:

1. **Category: the clear winner, not a fixed bar.** Compare what was said with every category still on the board that has an open clue. A category matches if the words said point to it **and to no other category as well**. One distinctive word is enough ("tennis", "Oscar", "capitals"). If two categories fit equally ("history" with AMERICAN HISTORY and HISTORY OF ART on the board), it's "Didn't catch the category." The player says more, or taps.
   - Filler words ("I'll take", "the", "for", "please") never count toward a match, as today.
   - Small slips still match, as today ("sciense").
   - Categories whose clues are all played are not candidates, so "history" picks AMERICAN HISTORY once HISTORY OF ART is cleared.
2. **Numbers in category names match spoken either way:** "20th" = "twentieth", "'80s" = "eighties", "10" = "ten", "II" = "two" / "2", "&" = "and", "St." = "saint" / "street".
3. **Amounts.** Only amounts on this board count. Also accept:
   - "for 400" run together into one number, when it starts with 4 and the rest is a board amount ("4400" → 400, "41000" → 1,000), and only when the whole number isn't itself a board amount.
   - a time: "4:00" → 400, "10:00" → 1,000.
   - digits with a number word: "4 hundred", "2 thousand".
   - the teens ("fourteen hundred" → 1,400) and "hundreds" for "hundred".
   An amount that was heard still always wins over Quick picks' lowest value, as today: "Opera for 600" with 600 played is "That one's already been played."
4. **Several hearings.** Try the top hearing first, then each other hearing (up to the 5 the phone already asks for). The first one that makes a pick wins. If none does, the message is the top hearing's problem, and the phone shows the top hearing's words, as today.
5. **Never a wrong pick to save a miss.** When in doubt (a tie, a weak fuzzy match, two different amounts heard), fail with the message. A failed pick costs a second press; a wrong pick costs the game.

**Edge cases:**
- **Tie between categories:** "Didn't catch the category." Nothing is picked.
- **The category is found but not the amount** (Quick picks off, more than one clue left): "Didn't catch the amount.", as today.
- **Two amounts in one sentence** ("science for 400, no, 600"): the **last** amount said wins.
- **A spoken pick arrives after control moved** (the controller disconnected for 10 s): unchanged. The server rejects it; nothing new.
- **The host's spoken pick** (host device, space bar or buzzer) uses the same matcher, so the same rules apply.

**Success Criteria:**
- Every row in the table above picks the "Should be" clue, and every "already works" phrase still does, as unit tests over a fixed board built from real category names.
- A tie ("history" with two history categories open) picks nothing and says "Didn't catch the category."
- A pick where only the 2nd hearing matches is made; the shown words are the top hearing.
- Production QA: across one full game, at least 9 of 10 spoken picks are made on the first press when the player says the category the way they naturally would (a shortened name is fine).

**Out of scope:** Abbreviations the board doesn't spell ("WWII"); picking by value alone ("the 400"); picking by row or column ("top left"); changing the messages or the listening UI; server-side matching; logging failed picks (see the handoff).
