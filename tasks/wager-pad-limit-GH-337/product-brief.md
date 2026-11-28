---
task-type: enhancement
task-title: "The wager pad stops at the limit"
---
**Task Type:** Enhancement (polish) to wagers. QA (production, 2026-11-28): "Can enter on wager more than 800." Wyatt confirmed on 2026-11-28 that the over-limit wager was **not accepted**, so the server's check works. A report that the pad got stuck on an iPhone is set aside until it's reproduced.

**Product docs:** `docs/product-docs/features/wagers/interaction-design.md` (Number pad).

**Problem:** The number pad accepts any digits, up to 7 of them. "8000" can be typed for a $800 limit; only the hint ("At most $800") and a disabled **Wager** button say why it can't be sent. (A player with more than $800 may wager up to their score; that's correct.)

**Outcomes:** A player can't type an amount they can't wager.

**Player flow:**
- A digit that would take the amount past the limit isn't added. The amount shakes once (no motion with reduced motion), and the hint shows "At most $800".
- **Max** still fills in the limit; backspace and **Min** are unchanged.
- Below the minimum ("$3" on a Daily Double), the pad accepts digits, and **Wager** stays disabled with "At least $5", as today.
- The same on the host's stage pad, and on the masked Final pad (the shake still shows nothing of the amount).

**Success Criteria:**
- `web/src/game/WagerPad.test.tsx`: with max 800, typing 8, 0, 0, 0 leaves 800. With max 1,200 and the amount 120, typing 0 gives 1,200 and typing another 0 is refused.
- A game server test confirms a Daily Double wager above the limit is rejected with the existing error. Add it if missing.

**Out of scope:** the unreproduced stuck pad, voice wagers, changing the limits.
