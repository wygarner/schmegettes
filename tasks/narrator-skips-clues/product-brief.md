---
jira-type: bug-fix
jira-title: "Narrator reads every clue on supported hosts"
---
**Task Type:** Bug Fix. The selected Schmegettes narrator is already required to read every clue; QA found that Norman silently skips many of them.

**Product docs:** No durable product-doc change. The intended behavior is already defined in `docs/product-docs/features/gameplay/feature-brief.md` ("The narrator's voice") and `interaction-design.md` (clue timing and narration failures).

**Problem:** In QA, Norman did not read many clues. The clue stayed on the TV and the game eventually opened buzzing on the server's fallback timer, so the round remained playable but the room had to read in silence. This breaks the shared-TV experience and makes the opening of buzzing feel arbitrary.

Current implementation evidence points to a timing defect, not bad clue data: synthesis begins after the 1.5 s pick reveal, although the product docs say the clue is prepared during that reveal. The narrator then has 1.5 s to synthesize the whole first sentence; many clues are one long sentence and can miss that deadline. Engineering should confirm the cause across all three voices and supported host devices rather than treating Norman as the only affected voice.

**Outcomes:**
- On a supported host device, every ordinary clue is read completely in the selected Schmegettes voice, including long clues with no early sentence break.
- The narrator uses the pick reveal to prepare the clue and starts the first word within 1 s after the clue appears, as already designed.
- Buzzing opens only after the room heard the full clue. A genuine synthesis failure still uses the existing server fallback so the game cannot get stuck.
- Kristin, Norman, and John meet the same behavior; no device voice stands in.

**Player flow:**
- A contestant picks a clue. For 1.5 s, the TV blinks the cell and grows the category/value card. Nothing is spoken, but the host device may prepare the selected narrator's audio during this reveal.
- The clue replaces the card. Within 1 s, the selected narrator starts reading it. Buzzers remain dim while the complete clue is read, regardless of clue length or punctuation.
- When the final word finishes, the host reports the reading complete and the server opens buzzing. A buzz during the reveal or reading remains an early buzz under the existing 250 ms lockout rule.
- Daily Double clues and the Final clue follow the same rule: the entire clue is heard before their answer window begins. Correct-response lines continue to finish before the board returns, subject to their existing 6 s cap.
- If a line genuinely cannot start within the existing failure allowance, or synthesis errors, it is skipped as today: the text remains visible, the server's fallback timer advances the game, and the next narrated line tries the selected voice again. One failure never disables narration for the rest of the game.
- A disconnect, reload, or pause keeps the existing gameplay behavior. On resume, the clue is re-read with its new deadline; players never gain a buzzing opportunity while narration is still playing.

**Success Criteria:**
- On each supported QA host class (recent iPhone/iPad and a current desktop browser), Kristin, Norman, and John each read a representative board without skipped ordinary clues.
- The QA set includes short clues, long single-sentence clues, multiple-sentence clues, abbreviations, quotations, numbers, and punctuation-light clues. Every line is complete and in order.
- For a normal clue, the first word begins within 1 s after the 1.5 s reveal ends, and buzzing cannot open before the final word ends.
- Daily Double and Final answer windows cannot begin before their full clue reading ends.
- Correct-response narration still respects the sound effect first, full narration, 1 s return delay, and 6 s maximum already specified.
- A forced synthesis timeout or error skips only that line, leaves the clue readable, advances on the server fallback, and retries the same selected voice on the next line.
- No path uses a built-in device voice, changes narrator mid-line, freezes the game, or makes the host's buzzer visibly lag.

**Out of scope:** New narrator voices, changing voice speed or the 1.5 s pick reveal, server-generated audio, a built-in device-voice fallback, editing clue text to make synthesis easier, changing buzz/answer timer options, or adding narrator diagnostics to the player UI.
