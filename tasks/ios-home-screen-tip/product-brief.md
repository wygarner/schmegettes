---
jira-type: enhancement
jira-title: "Home Screen tip for full screen on iPhone and iPad Safari"
---
**Task Type:** Enhancement to the lobby. QA (2026-11-18) logged "Force hide toolbar is not working on iPhone Safari". It isn't a code defect: iPhone Safari has no fullscreen API for web pages, and the existing code (`web/src/lib/fullscreen.ts`) already relies on the Home Screen app for iOS. What's missing is telling the host.

**Product docs:** `docs/product-docs/features/lobby/feature-brief.md#full-screen-on-iphone-and-ipad` and `features/lobby/interaction-design.md` (Home Screen tip, edge cases).

**Problem:** On an iPhone in Safari, the toolbar takes space from the host screen mirrored to the TV, and nothing tells the host how to get rid of it.

**Outcomes:** A host on iPhone/iPad Safari learns once that adding Schmegettes to the Home Screen gives full screen.

**Player flow:**
- On an iPhone or iPad, in Safari, not opened from the Home Screen: the **host lobby** shows a slim banner across the top of the stage: "⤴ For full screen, add Schmegettes to your Home Screen: tap Share, then Add to Home Screen." with ✕.
- ✕ hides it for good on that device. Never on joining phones, in a game, in the Home Screen app, or in other browsers.
- At 667 × 320 the banner doesn't push the room code off screen.
- **In the Home Screen app** (it opens full screen already, `display: fullscreen`/`standalone`), iOS keeps storage apart from Safari's: the host signs in or redeems a host code there once, and the narrator voice downloads there once.

**Success Criteria:**
- The banner shows on iPhone Safari and iPad Safari in the host lobby, and nowhere else (desktop, Android, Home Screen app, phones that join).
- ✕ survives reloads on that device.
- Opened from the Home Screen on an iPhone, the host screen has no Safari toolbar, and the app's start page leads the host to sign in / redeem a code if needed.

**Out of scope:** an Android install prompt, blocking hosting in Safari, a QR code.
