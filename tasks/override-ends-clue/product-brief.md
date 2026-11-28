---
task-type: enhancement
task-title: "An override to correct ends the clue: later answers on it don't count"
---
**Task Type:** Enhancement to host overrides. QA (production, 2026-11-28): "Answer was correct but needed to be overridden. Next player answered correctly. Override gave points to the latter player and the former." The current rule ("both gain the value") is as documented, so this is a rule change, not a bug.

**Product docs:** `docs/product-docs/features/scoreboard-and-overrides/feature-brief.md` (Host overrides) and `interaction-design.md` (Edge cases). Both are updated in the qa-2026-11-28 docs change.

**Problem:** When the judge wrongly rejects Bob's answer, buzzing reopens, and Alice answers right, a host override gives both $400. On the show, the clue would have ended with Bob. Alice only got a turn because of the judge's mistake, and a correct override shouldn't add money to the game.

**Outcomes:** Overriding an answer to correct puts the clue back where it should have ended.

**Options:**
1. **Later answers don't count (recommended).** Every answer after the overridden one on that clue scores $0 and shows **DOESN'T COUNT**. A later right answer gains nothing, and a later wrong answer's loss is given back.
2. **Later right answers are cancelled, later wrong answers stand.** This punishes players for a turn they shouldn't have had.
3. **Keep both (today).** Simple, but it adds money to the game and rewards the judge's mistakes.

**Player flow (option 1):**
- On the correct-response screen, the host overrides Bob (the first answer) to correct. Bob: +$400 (was −$400). Every later answer on the clue (Alice ✓ +$400, Carol ✗ −$400) becomes $0 with the label **DOESN'T COUNT**, on the TV's verdict lines and on those players' phones ("Doesn't count: the host overrode an earlier answer. $0").
- **Control** goes to Bob.
- **Flipping Bob back to incorrect** restores the later answers to their judged verdicts and amounts, and control goes back to whoever has the latest counted correct answer.
- **Overriding a later answer** while an earlier one is correct: not possible. Its row is greyed out with "Doesn't count", since a doesn't-count answer can't be overridden.
- **Daily Double and Final:** unaffected. Daily Doubles have one answer; each finalist answers alone.
- **Recorded:** the later answers keep their judge verdict and rule, with a new verdict state `voided` and score change $0. A final score is still the sum of that player's scored answers.

**Success Criteria:**
- Game server tests: Bob wrong → Alice right → override Bob correct gives Bob +v, Alice 0, control to Bob. Override Bob back gives Bob −v, Alice +v, control to Alice. The same with a later wrong answer, whose loss is given back.
- Scores on the TV, phones, the end-of-game scoreboard and My games match the sum of counted answers.
- Old games in history are unchanged. No backfill: they were scored under the old rule.
- Contract: `verdict_overridden` carries every changed answer's verdict and delta, so the TV and phones update in one message. This is a contract change in `shared/`. A database migration is needed if `voided` is a new verdict value.

**Out of scope:** overriding earlier clues, Final reveal changes.

**Decision needed (Wyatt):** confirm option 1.
