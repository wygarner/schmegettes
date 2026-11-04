---
jira-type: new-feature
jira-title: "Wagers: Daily Doubles and Final Schmegettes"
---
**Task Type:** New Feature. Wagering is a new player-facing capability, and Final Schmegettes is a new round, not a tweak to the core loop.

**Problem:** A game ends abruptly when the Double board runs out. Daily Double squares play like any other clue, and Final Schmegettes, the round that decides the winner, doesn't exist. The phases (`daily_double_wager`, `final_category`, `final_wager`, `final_answer`, `final_reveal`) are already in the contracts, and the board builder already places Daily Doubles and the Final clue, but the game server and web app don't handle them.

**Outcomes:**

- Picking a Daily Double lets the player in control wager and answer alone, with no buzzing.
- After the Double board, every contestant above $0 plays Final Schmegettes: a secret wager, a private spoken answer, and a reveal on the TV, lowest score first.
- A game reaches `finished` through Final (or a skipped Final when nobody is above $0) and is recorded that way.

**Player flow:** the full rules are in [wagers feature brief](../../docs/product-docs/features/wagers/feature-brief.md) and [interaction design](../../docs/product-docs/features/wagers/interaction-design.md). In short:

- *Daily Double:* 2 s reveal → wager on the phone, **$5 to max(score, $800 Single / $1,600 Double)**, 30 s, default $5 → TV shows the wager (public) → clue read → phone listens, at most 14 s → ±wager, control stays.
- *Final:* finalists are scores **> $0** (none: skip to final scores) → category → secret wager **$0 to score**, 30 s, default $0 → clue read → every finalist answers quietly into their own phone at once, 30 s, **first answer heard locks in** → reveal, lowest pre-Final score first, about 8 s each → final scores, `finished`.
- *Host who plays:* Daily Double wager in the player column (public); Final wager masked `$ •••••`; no Final transcript on the host device.
- *Edge cases:* a disconnect never stops a timer; no answer is −wager (Daily Double and Final both, so disconnecting never helps); host device disconnect pauses all timers; Final amounts and the correct response never reach the TV or other phones before the reveal; tied top scores are joint winners.

**Success Criteria:**

- A 2-player game played start to finish hits at least one Daily Double and ends through Final with correct scores, recorded as `finished`.
- Wagers outside the limits are rejected by the server (tested).
- No Final wager amount, Final transcript, or correct response is in any message to a phone or the host device before the reveal (tested on the WebSocket payloads).
- Each wager outcome is a scored answer, so a final score still equals the sum of that player's scored answers.
- Every timer (DD wager 30 s, Final wager 30 s, Final answer 30 s) falls back to its default when it expires, and pauses while the host device is disconnected.
- The host-plays views fit the 667 × 320 host screen.

**Out of scope:** host overrides, the full scoreboard, and Rematch (feature 3); voice wagers; typed answers; sound and music; wager hints.
