# Scoreboard, Rematch, and Host Overrides

> Status: not yet implemented. Designed in [results/scoreboard-and-history](../../../../devtools/src/designs/results/scoreboard-and-history.tsx).

## Why

This is feature 3 of 3 ([gameplay](../gameplay/feature-brief.md) is 1, [wagers](../wagers/feature-brief.md) is 2).

Judging is automatic and generous, but speech-to-text still mishears: Bob says "Krakatoa", the phone hears "crack a toe a", and Bob loses $400 for a right answer. The room knows it was right. The host needs a quick, visible way to fix it, so a misheard answer never decides a game.

The game also needs an ending worth staying for: a scoreboard that names the winner, and one press to play again with the same people.

## Jobs to be done

| Who | Job |
|---|---|
| Host | "When the game misjudges an answer, I fix it in a couple of taps, and everyone can see I did." |
| Contestant | "If I'm misheard, the host can give me the points, and I see it on my phone." |
| Contestant | "At the end I see who won, where I finished, and my score." |
| Host | "When we want another round, I press Rematch and everyone's back in the lobby with a fresh board." |
| Contestant | "I can leave at the end without breaking anything." |

## Rules

### Host overrides

- **Who:** only the host device, whether or not the host plays. Phones can't override. A playing host can override their own answer.
- **What:** any judged answer of the clue that just ended: regular clues and Daily Doubles. "No answer heard" counts as a judged answer. A buzz that was never judged (the player disconnected before answering) isn't listed. Final answers are overridden during the reveal (below).
- **When:** on the correct-response screen. An **Override** control sits next to the verdict line. A clue nobody buzzed on has nothing to override.
- **The clock pauses** while the host reviews: the 6 s correct-response timer stops and resumes when the review closes. Nothing else is running at that point.
- **Effect:** the verdict flips. Incorrect → correct gives **+value** in place of **−value** (a swing of twice the value); correct → incorrect the reverse. For a Daily Double the amount is the wager. The answer's scored amount changes, so a final score is still the sum of that player's scored answers ([game history](../game-history/feature-brief.md)).
- **Control** goes to whoever now has the latest correct answer on that clue. If no answer on it is correct, control goes back to whoever had it when the clue was picked. A Daily Double never moves control.
- **Two right answers on one clue** are possible after an override (Bob overridden to correct, then Alice also correct). Each answer is scored on its own; both gain the value.
- **Visible to the room:** the verdict line gets a gold **HOST OVERRIDE** chip, the tile shows the score change, and the player's phone shows "Host override: ✓ +$400".
- **Recorded** with the answer: the original verdict and that the host changed it.
- **Final:** while a finalist is on the reveal stage, after their verdict line, the host can override it. The reveal pauses during the review and continues with the new verdict, wager line and score. Once the reveal has moved to the next finalist, that answer can't be changed.
- Earlier clues can't be overridden.

### End-of-game scoreboard

When the game is `finished` (after the Final reveal, or a skipped Final):

- **TV:** "Final scores", the date, start time and length; a winner card (🏆, WINNER or TIED FOR 1ST, the names, the score); every contestant ranked with their placement. Tied scores share a placement (two 1st, then 3rd). The player column stays. "Saved to everyone's game history".
- **Host device:** **Rematch**. No other button.
- **Phones:** "You finished 2nd", my score (🏆 if I won), the standings with my row highlighted, "Waiting for Wyatt: stay for a rematch, or leave.", and **Leave**. The buzzer stays, `idle`.

### Rematch

The rules are in [game history](../game-history/feature-brief.md) (a new fresh board that avoids tonight's clues). On screen:

- The host presses **Rematch**; everyone still in the room returns to the lobby, scores at $0. The host is still joined if they played.
- Phones show "You're in, Bob." with a gold **REMATCH** label: "Same room, fresh board. Waiting for Wyatt to start."
- The TV lobby shows the same code; new players can join until Start.
- Disconnected players stay listed, dimmed, as in any lobby. Players who pressed **Leave** are gone.

### Leave

**Leave** on the scoreboard takes the player out of the room. The game stays in their [My games](../game-history/interaction-design.md#look-back-at-past-games-any-player).

## Out of scope

- Overriding a clue after the next pick, or a Final answer after the reveal moves on
- Appeals from phones, or an LLM second opinion
- Per-game stats on the scoreboard (most correct, biggest Daily Double)
- Ending or closing a room from the UI
- Sound and music
