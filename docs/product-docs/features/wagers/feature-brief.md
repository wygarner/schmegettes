# Wagers: Daily Doubles and Final Schmegettes

## Why

Without wagers, a game just stops when the Double board runs out. Wagers are where the comebacks and the drama happen: a Daily Double lets the player in control bet on what they know, and Final Schmegettes lets everyone still in the black stake their score on one last clue. With Final, a game has a real ending.

This is feature 2 of 3 ([gameplay](../gameplay/feature-brief.md) is feature 1). Feature 3 adds host overrides, the full end-of-game scoreboard, and Rematch.

## Jobs to be done

| Who | Job |
|---|---|
| Contestant who finds a Daily Double | "I hit a Daily Double, so I decide how much to bet before I hear the clue, then I get to answer it alone." |
| Contestant in Final | "I bet secretly on my phone after seeing the category, type my answer, and nobody can see my bet or copy my answer." |
| Host (TV) | "The TV runs wagers by itself: it explains the limits, waits for bets, reads the clue, and reveals Final one player at a time." |
| Host who plays | "I wager on the host device like everyone else, and the room can't see my Final bet even though my screen is on the TV ([lobby](../lobby/feature-brief.md))." |
| Everyone in the room | "The Final reveal builds suspense: one player at a time, ending with the winner." |

## Rules

### Daily Doubles

- **Where they are.** Each Single board has **1** Daily Double and each Double board has **2**, in different categories and never in the top row. The board builder already places them ([game history](../game-history/feature-brief.md)). They look like any other cell until picked.
- **Who plays it.** Only the player who picked it. Nobody buzzes.
- **Reveal.** The TV shows "DAILY DOUBLE" over the stage for **2 s**, and the narrator says "It's a Daily Double." The TV shows the category and nothing else from the clue.
- **Wager limits.** Whole dollars from **$5** up to the larger of the player's score and the round's top value (**$800** in Single, **$1,600** in Double). A player at $0 or below can still bet up to $800 / $1,600.
- **Entering the wager.** The player enters it on their phone (or on the host device's stage, when the host plays: the player column has no room for a number pad) with a number pad and two shortcuts: **Min** ($5) and **Max** (the limit). **Wager** confirms it. The TV shows "Alice is wagering…" with the range ("$5 – $1,200").
- **Wager timeout: 30 s.** If no wager is confirmed in time, the wager is the minimum, $5. The game never waits forever.
- **The wager is public.** Once confirmed, the TV shows "Alice wagers $1,000" for 2 s.
- **Reading and answering.** The narrator says "For 1,000, here's the clue." and reads it. When the reading ends, the player's phone **starts listening on its own**, as after a won buzz: until they go quiet, at most **14 s**.
- **Judging.** Same generous judging as any clue. Correct: **+wager**. Incorrect or no answer: **−wager**. There is no reopen: nobody else can answer.
- **Control.** The player keeps control either way.
- **After.** The TV shows the correct response for 6 s, as for any clue, then the board.

### Final Schmegettes

**Who plays.** Every contestant whose score is **above $0** when the Double board ends. Everyone else watches; their phone says "You're not in Final. Watch the TV." Disconnected contestants with a positive score are still in.

- **Nobody above $0:** Final is skipped. The TV says "Nobody's in the black: no Final Schmegettes." for 4 s and goes to the final scores.
- **One player above $0:** Final runs normally with that one player.

**The flow:**

1. **Category (`final_category`).** The TV shows "FINAL SCHMEGETTES" for 3 s, then the category. The narrator says "The Final Schmegettes category is: {category}."
2. **Wager (`final_wager`), 30 s.** Each finalist enters a **secret** wager on their phone, from **$0 up to their whole score**. The host's Final wager is masked (`$ •••••`), because the host device is on the TV. The TV shows each finalist's tile with "wagering…" or "✓ locked", never an amount. The phase ends when every finalist has locked in, or at 30 s. **An unlocked wager counts as $0.**
3. **Clue and answer (`final_answer`).** Final answers are **typed, not spoken**, so in a room full of people nobody can overhear and copy. The TV shows the clue, and the narrator reads it. Each finalist's phone shows a text field as soon as the clue appears. The **30 s** timer starts when the reading ends.
   - The finalist types their answer (at most 200 characters; "What is" is optional) and taps **Submit**. They can edit until they submit. After that it's locked.
   - When time runs out, whatever is in the field is submitted. An empty field is no answer.
   - The phone sends the draft to the server as the player types, so a draft survives a disconnect.
   - The host types on a blind keypad on the stage, under the clue, into a masked field (`•••••`), because the host device is on the TV ([design system](../../architecture/design-system.md#blind-keypad)).
   - No answer is shown on the TV, the host device, or another phone until the reveal.
4. **Reveal (`final_reveal`).** One finalist at a time, **lowest score first** (by score before Final; ties in join order), so the leader goes last. For each finalist the TV shows, about 2 s apart: their **response** (or "No answer"), the **verdict**, the **wager**, and the **new score**. About 8 s per finalist.
5. **Finished.** The TV shows the final scores, highest first, and the game is recorded as **finished**. Players tied for the top score are all winners; there's no tiebreak. Feature 3 replaces this screen with the full scoreboard and Rematch.

**Judging.** Same generous judging as any clue, and typos count as small slips: "Krakatowa" is right. Correct: +wager. Incorrect or no answer: −wager. A $0 wager changes nothing.

### Scores and history

- Every wager result is recorded as a scored answer with its amount, so a final score is still the sum of that player's scored answers ([game history](../game-history/feature-brief.md)).
- A Daily Double counts as seen once its clue is shown. Final counts as seen for every player in the game, finalist or not, once its clue is shown.

### Fairness and disconnects

| Situation | Rule |
|---|---|
| Daily Double player disconnects while wagering | The 30 s timer keeps running. Back in time: they wager as normal. Otherwise $5. |
| Daily Double player disconnects while answering | No answer, so **−wager**. Unlike a normal clue there's nobody to reopen buzzing for, and skipping the penalty would reward disconnecting. |
| Finalist disconnects during the wager | Timer keeps running. Back in time: they can still lock in. Otherwise $0. |
| Finalist disconnects while answering | The last draft the server received counts when time runs out. No draft: no answer, **−wager**. Back in time: they keep typing. |
| A finalist peeks at someone else's phone | Not something the game can stop. Answers are typed so they can't be overheard, and the TV never shows them before the reveal. |
| Host types a Final answer on the mirrored host device | The host types on a **blind keypad** on the stage, not the iOS keyboard (which is mirrored and pops up each key as it's pressed). Its keys never highlight and the field shows dots, so the TV shows only the answer's length. |
| Wagers out of range | The server rejects them. The phone only offers amounts inside the limits. |
| Host device disconnects | The game pauses (as in [gameplay](../gameplay/feature-brief.md)): all wager and answer timers stop and resume with the time they had left. A clue being read is read again from the start. |
| The correct response | Never reaches a phone. The TV gets it only once Final is revealed or a Daily Double is judged. |
| Final wagers | The amounts never reach the TV, the host device, or another phone before the reveal. |

## Out of scope

- Host overrides of a verdict, the full scoreboard, and Rematch (feature 3)
- Voice wagers ("I'll bet a thousand")
- Spoken Final answers (Final is always typed)
- Typed answers for regular clues and Daily Doubles (they're spoken)
- Wager suggestions or strategy hints
- Sound effects, music, and a "think" tune for Final
