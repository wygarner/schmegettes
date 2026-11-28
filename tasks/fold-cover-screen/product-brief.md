---
task-type: bug-fix
task-title: "The app fits the Galaxy Z Fold 8's cover screen"
---
**Task Type:** Bug Fix. QA (production, 2026-11-28): "App is really small on front screen on Galaxy Z Fold 8."

**Product docs:** `docs/product-docs/architecture/design-system.md` (layout and supported sizes). The phone screens are designed at 390 × 844 and the host at 844 × 390.

**Problem:** On the Fold 8's front (cover) screen, the app renders very small. Nothing in the app scales the page, so the likely causes are the viewport the browser reports on that screen (CSS width, `devicePixelRatio`, the `viewport` meta tag) or a layout with a fixed minimum width that the browser shrinks to fit. **Not reproduced yet.**

**Known (Wyatt, 2026-11-28):** a contestant's phone (not the host), in Chrome. The wager pad also got stuck in the same QA session, possibly on this phone (`wager-pad-limit`).

**Still needed before a spec:**
- A screenshot from the cover screen, and which page (Home, join, lobby, game).
- If possible, the numbers from opening `https://schmegettes.app` with a reporting page or devtools: `innerWidth`, `innerHeight`, `devicePixelRatio`.

**Outcomes:** Text and buttons on the cover screen are the same physical size as on any other phone, and nothing needs zooming.

**Player flow:** no change. The same screens fit the narrower screen. On narrow widths (under 360 CSS px), text wraps and the board's columns narrow before anything shrinks.

**Success Criteria:**
- With the cover screen's real viewport (from the repro), Home, the lobby and every game phase on a phone render at normal size with no horizontal scrolling. Checked in a Playwright viewport at that size and on the device.
- No change at 390 × 844 or 844 × 390 (screenshot comparison).
- The supported phone sizes in `design-system.md` include the cover screen's width.

**Out of scope:** a layout for the unfolded inner screen (it's tablet-sized; tracked separately if needed).
