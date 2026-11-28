---
task-type: bug-fix
task-title: "The wager pad stops at the limit and never gets stuck"
---
**Task Type:** Bug Fix to wagers (was filed as polish). QA (production, 2026-11-28): "Can enter on wager more than 800." Wyatt confirmed on 2026-11-28 that the over-limit wager was **not accepted**, so the server's check works. But the pad "kind of bugged out" and the player **couldn't enter a wager at all**.

**Product docs:** `docs/product-docs/features/wagers/interaction-design.md` (Number pad), updated in the qa-2026-11-28 docs change.

**Problem:**
- The number pad accepts any digits, up to 7 of them. "8000" can be typed for a $800 limit; only the hint ("At most $800") and a disabled **Wager** button say why it can't be sent.
- The player then couldn't get to a valid wager. The pad's logic (`web/src/game/WagerPad.tsx`) lets backspace and **Min**/**Max** recover, so the likely cause is layout. A long amount, or a narrow or short phone screen, can push **Wager** or the keys off-screen in a container that doesn't scroll (`PlayerGame` is fixed at `100dvh`). This may be the same phone as `fold-cover-screen` and `android-keyboard` (an Android phone in Chrome). **To confirm (Wyatt):** which phone it was, and what the pad looked like.
- The Daily Double timer then ran out, so the wager was the minimum ($5).

**Outcomes:** A player can always reach a valid wager in a few taps, on any supported phone, and can't type an amount they can't wager.

**Player flow:**
- A digit that would take the amount past the limit isn't added. The amount shakes once (no motion with reduced motion), and the hint shows "At most $800".
- **Max** still fills in the limit; backspace and **Min** are unchanged.
- Below the minimum ("$3" on a Daily Double), the pad accepts digits, and **Wager** stays disabled with "At least $5", as today.
- The amount, every key, and **Wager** are always on screen together, at every supported phone size, the Fold cover screen included. Nothing scrolls, and the amount text never wraps or pushes the keys down.
- The same on the host's stage pad, and on the masked Final pad (the shake still shows nothing of the amount).

**Success Criteria:**
- `web/src/game/WagerPad.test.tsx`: with max 800, typing 8, 0, 0, 0 leaves 800. With max 1,200 and the amount 120, typing 0 gives 1,200 and typing another 0 is refused.
- Playwright screenshots of the Daily Double and Final wager screens at 390 × 844, 360 × 640 and the Fold cover screen's viewport (from `fold-cover-screen`): all keys and **Wager** visible and tappable.
- A game server test confirms a Daily Double wager above the limit is rejected with the existing error. Add it if missing.

**Out of scope:** voice wagers, changing the limits.
