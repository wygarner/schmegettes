---
jira-type: new-feature
jira-title: "Design pass 2/3: end-of-game scoreboard, Rematch, host overrides"
---
**Task Type:** New Feature. Part 2 of the design pass (1: [restyle](../design-pass-restyle/product-brief.md), which ships first; 3: [My games](../design-pass-history/product-brief.md)). This is feature 3 of the gameplay set: new player-facing capabilities.

**Problem:** A misheard answer can't be fixed: Bob says "Krakatoa", speech-to-text hears "crack a toe a", and he loses $400 for a right answer. The game also ends on a bare list of scores with no way to play again.

**Outcomes:**

- The host can override a misjudged answer, visibly, and the score and control follow.
- A finished game ends on a scoreboard that names the winner, with **Rematch** on the host device and **Leave** on phones.

**Player flow:** rules in [scoreboard and overrides](../../docs/product-docs/features/scoreboard-and-overrides/feature-brief.md) ([interaction design](../../docs/product-docs/features/scoreboard-and-overrides/interaction-design.md)) and [game history](../../docs/product-docs/features/game-history/feature-brief.md) (Rematch boards). Visual reference: `devtools/src/designs/results/scoreboard-and-history.tsx` ("End of game + Rematch", "Host override").

- *Host override:* on the correct-response screen, **Override** next to each verdict line → a review sheet (what they said, the correct response, the score and control change) with the 6 s clock paused → **Mark correct / incorrect** flips the verdict: ±value (a swing of twice the value; the wager on a Daily Double), labeled HOST OVERRIDE on the TV and on that player's phone. Control goes to the latest correct answer on the clue, else back to who had it when the clue was picked; a Daily Double never moves control. Final answers can be overridden during that finalist's reveal step. Earlier clues can't.
- *End of game:* `finished` → TV scoreboard (winner card, ranked rows, ties share a placement, TIED FOR 1ST), **Rematch** on the host device; phones show my placement, score and the standings, with **Leave**. **Rematch** → everyone still in the room back in the lobby at $0 with a REMATCH label; a fresh board on Start.
- *Edge cases:* an override while the host device disconnects closes the sheet and resumes the clock with its time left; overriding an answer to correct can leave two correct answers on one clue (both score); a disconnected player's score still changes; Rematch pressed twice counts once; a player who pressed Leave isn't in the rematch lobby but can rejoin by code before Start.

**Success Criteria:**

- An override changes the answer's scored amount, so a final score still equals the sum of that player's scored answers, and the stored verdict shows it was overridden (tested).
- Only the host device can override; a phone that sends one is rejected (tested).
- A full game reaches the scoreboard; **Rematch** returns the remaining players to the lobby and the next board avoids the previous game's clues.
- The scoreboard fits with 6 contestants at 667 × 320.

**Out of scope:** overriding earlier clues or a Final answer after the reveal moves on; appeals from phones; per-game stats; ending a room from the UI; My games (ticket 3).
