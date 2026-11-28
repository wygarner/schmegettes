---
task-type: bug-fix
task-title: "On Android, the on-screen keyboard never covers the field being typed in"
---
**Task Type:** Bug Fix. QA (production, 2026-11-28), from Wyatt: "another important bug on Android: the keyboard is blocking input fields."

**Product docs:** `docs/product-docs/features/wagers/interaction-design.md` ("The countdown sits above the field so the keyboard never covers it"), and the sign-in, join and lobby screens in `features/accounts/`, `features/lobby/`, `features/navigation/`. No rule changes: the docs already promise this, and Android breaks it.

**Problem:** Chrome on Android (since version 108) no longer shrinks the page's layout when the keyboard opens. Only the visible area shrinks. Our viewport tag (`web/index.html`) doesn't opt back in, and our phone screens are sized to the full screen height (`100dvh`, with `PlayerGame` fixed at that height). So the keyboard slides over the bottom of the screen and covers the field and its button. iPhone Safari scrolls the focused field into view, so the bug is Android-only.

**Fields affected:** every text field a player types in on a phone. The Final answer field (most important: it's timed), the room code and name on Join, sign-in and sign-up, account settings, and the host lobby's text fields on an Android host.

**Outcomes:** On Android, the field being typed in, its submit button, and (for Final) the countdown are always visible above the keyboard.

**Player flow:**
- The player taps a field and the keyboard opens. The screen's content shrinks to the space above the keyboard, so the focused field, its button and the Final countdown are visible without scrolling.
- The keyboard closes and the screen returns to full height, with no jump in the board or the buzzer.
- **Final answer:** the field, **Submit** and the countdown stay above the keyboard for the whole 30 s, on a 360 × 640 Android phone.
- iPhone behaviour is unchanged.

**Approach (for the spec to confirm):** add `interactive-widget=resizes-content` to the viewport meta tag, so Android resizes the layout as before. Make sure fixed-height containers use `100dvh` (which then follows the keyboard), or follow `window.visualViewport` where a fixed height is needed. Check `HostLobby.tsx`, which still uses `100vh`.

**Success Criteria:**
- Playwright, with an Android Chrome emulation and the keyboard simulated by a shrinking visual viewport: on every screen with a text field, the focused field and its submit button are within the visible area.
- On a real Android phone in Chrome (QA's Fold 8, and any other Android phone): the Final answer, join and sign-in fields are typeable and visible. Record this in the evidence as a human-checklist item.
- No change on iPhone Safari at 390 × 844 (screenshot comparison).

**Out of scope:** the cover-screen size issue (`fold-cover-screen`), and the wager pad, which uses no keyboard.
