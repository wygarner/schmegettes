---
task-type: enhancement
task-title: "The wager pad stops at the limit"
---
**Task Type:** Enhancement (polish) to wagers. QA (production, 2026-11-28): "Can enter on wager more than 800."

**Product docs:** `docs/product-docs/features/wagers/interaction-design.md` (Number pad), updated in the qa-2026-11-28 docs change.

**Problem:** The number pad accepts any digits, so "8000" can be typed for a $800 limit. Only the hint ("At most $800") and a disabled **Wager** button say it's wrong. The server already rejects wagers out of range. **Unconfirmed (Wyatt):** whether a wager above the limit was actually confirmed in QA. If it was, this is a bug in the server's check and becomes the priority. Note that a player with more than $800 may wager up to their score.

**Outcomes:** A player can't type an amount they can't wager.

**Player flow:**
- A digit that would take the amount past the limit isn't added. The amount shakes once (no motion with reduced motion), and the hint shows "At most $800".
- **Max** still fills in the limit; backspace and **Min** are unchanged.
- Below the minimum ("$0" or "$3" on a Daily Double), the pad accepts digits, and **Wager** stays disabled with "At least $5", as today.
- The same on the host's stage pad, and on the masked Final pad (the shake still shows nothing of the amount).

**Success Criteria:**
- `web/src/game/WagerPad.test.tsx`: with max 800, typing 8, 0, 0, 0 leaves 800. With max 1,200 and the amount 120, typing 0 gives 1,200 and typing another 0 is refused.
- A game server test confirms a Daily Double wager above the limit is rejected with the existing error. Add it if missing.

**Out of scope:** voice wagers, changing the limits.
