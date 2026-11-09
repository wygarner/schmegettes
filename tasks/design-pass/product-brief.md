---
jira-type: new-feature
jira-title: "Design pass: new look, red buzzer, scoreboard, Rematch, host overrides, My games"
---
**Task Type:** New Feature. Most of this is a restyle of screens that already work, but it also adds player-facing capabilities that don't exist: host overrides, the end-of-game scoreboard with Rematch, and My games.

**Problem:** The game plays end to end, but it looks like default Mantine components, not a quiz show: the theme's fonts are never loaded (headings fall back to Impact), the buzzer is a flat button labeled BUZZ, and the board, tiles and stages have no depth. On the host's mirrored iPhone, the Daily Double number pad crowds the player column, and the host's Final answer leaks to the room through the mirrored iOS keyboard. A misheard answer can't be fixed, the game ends on a bare list of scores with no way to play again, and players can't look back at past games.

**Outcomes:**

- Every screen (Home, host lobby, join, the clue loop, Daily Double, Final) uses the [design system](../../docs/product-docs/architecture/design-system.md): Oswald and Inter loaded, the night and stage colors, bevelled board and tiles, gold main actions, sheets, and the motion it defines.
- The buzzer is an oblong red dome the full width of its container, in a dark rim, with **no lettering**, in every view. State shows in its color and light; screen readers get the words.
- The host's Daily Double and Final wager pads sit on the stage. The host's Final answer is typed on a blind keypad, so the TV shows only its length.
- The host can override a misjudged answer, visibly, and the score and control follow.
- A finished game ends on a scoreboard that names the winner, with **Rematch** on the host device and **Leave** on phones.
- Players can open **My games** from Home and see any past game's scoreboard.

**Player flow:** the rules are in the durable docs: [design system](../../docs/product-docs/architecture/design-system.md), [gameplay](../../docs/product-docs/features/gameplay/interaction-design.md), [wagers](../../docs/product-docs/features/wagers/interaction-design.md), [lobby](../../docs/product-docs/features/lobby/interaction-design.md), [game history](../../docs/product-docs/features/game-history/interaction-design.md), and the new [scoreboard and overrides](../../docs/product-docs/features/scoreboard-and-overrides/interaction-design.md). The visual reference is the five prototypes in `devtools/src/designs/` (`mise run dev:devtools`): system/components, lobby/host-and-join, board/clue-loop, final/final-schmegettes, results/scoreboard-and-history. In short:

- *Buzzer:* same six states and tap rules as today (`idle`, `dim`, `lit`, `early`, `answering`, `locked`). Unlit red, a faint red ring while the clue is read, bright red pulsing when open, dark and shaking for the 250 ms early lockout, green after a won buzz, grey when locked. 120 px tall on phones, 64 px in the host column. The phone text above it carries the meaning ("Buzz when it lights up", "Say your answer", "You've answered this one").
- *Host inputs on the stage:* Daily Double wager pad (public); Final wager pad masked, with keys that never highlight; Final answer on a blind A–Z keypad under the clue (the clue shrinks), masked field, **Submit**. The iOS keyboard is never opened on the host device during Final.
- *Host override:* on the correct-response screen, **Override** next to each verdict line → a review sheet (what they said, the correct response, the score and control change) with the 6 s clock paused → **Mark correct / incorrect** flips the verdict: ±value (a swing of twice the value; the wager on a Daily Double), labeled HOST OVERRIDE on the TV and on that player's phone. Control goes to the latest correct answer on the clue, else back to who picked it; a Daily Double never moves control. Final answers can be overridden during that finalist's reveal step. Earlier clues can't.
- *End of game:* `finished` → TV scoreboard (winner card, ranked rows, ties share a placement, TIED FOR 1ST), **Rematch** on the host device; phones show my placement, score and the standings, with **Leave**. **Rematch** → everyone still in the room back in the lobby at $0 with a REMATCH label; a fresh board on Start (rules in game history).
- *My games:* Home → **My games** → rows (placement badge, date, Unfinished tag, players with "You", my score; WATCHED for games I only watched) → tap → that game's scoreboard. Newest first, 20 at a time, **Show more**, an empty state.
- *Edge cases:* an override while the host device disconnects closes the sheet and resumes the clock with its time left; overriding an answer to correct can leave two correct answers on one clue (both score); a disconnected player's score still changes; Rematch pressed twice counts once; a player who pressed Leave isn't in the rematch lobby but can rejoin by code before Start.

**Success Criteria:**

- Oswald and Inter are loaded; no screen falls back to Impact.
- Every host screen, with 6 contestants and the host playing, fits without scrolling at 667 × 320, 844 × 390 and 956 × 440 (the fit check in system/components), including the stage wager pads, the blind keypad and the scoreboard.
- The buzzer has no visible text in any state, keeps the existing state and tap rules (tests unchanged in meaning), and exposes the state label to screen readers.
- During the host's Final answer, no on-screen keyboard opens on the host device, and nothing on the host screen reveals a typed character (masked field, no key highlight).
- An override changes the answer's scored amount, so a final score still equals the sum of that player's scored answers, and the override is recorded with the original verdict (tested).
- Only the host device can override; a phone that sends an override is rejected by the server (tested).
- A full game reaches the scoreboard; **Rematch** returns the remaining players to the lobby and the next board avoids the previous game's clues.
- My games lists a player's played and watched games, newest first, 20 per page, with ties, Unfinished, and Former player shown as in the docs.

**Out of scope:** overriding earlier clues or a Final answer after the reveal moves on; appeals from phones; per-game stats; account linking (only the nudge text); ending a room from the UI; sound and music; QR codes; any change to timing, scoring rules, or judging.
