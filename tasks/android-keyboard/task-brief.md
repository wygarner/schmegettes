---
task-type: bug-fix
task-title: "On Android, the on-screen keyboard never covers the field being typed in"
---
# Task spec: Android keyboard

Product brief: [product-brief.md](product-brief.md).

## Cause

Chrome on Android (108+) resizes only the visual viewport when the keyboard opens; the layout viewport, and with it `100dvh`, keeps the full screen height. Our viewport tag (`web/index.html`) doesn't opt back in, and the phone screens are sized to the full height (`PlayerGame` is fixed at `height: 100dvh`; `HostLobby` uses `100vh`). Fields near the bottom (the Final answer, Join, sign-in, sheets) end up under the keyboard. iPhone Safari scrolls the focused field into view itself, so iPhone isn't affected.

## Subtasks

### 1. `web/`: let Android resize the layout for the keyboard

- `web/index.html`: viewport `content` becomes `width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content`. Browsers that don't know `interactive-widget` ignore it (iPhone Safari, older Chrome).
- `web/src/pages/HostLobby.tsx`: `mih="100vh"` → `mih="100dvh"`, like every other screen, so the lobby follows the resized viewport.
- Check, and fix if needed, that each text field's screen scrolls the focused field into view when the content is taller than what's left: `FinalAnswerField.tsx`, `JoinCode.tsx`, `JoinRoom.tsx`, `HostLobby.tsx`, and the sheets in `ui/menu.tsx` and `ui/Sheet.tsx`. With `resizes-content` the browser does this for normal flow. A container with `overflow: hidden` and a fixed height blocks it, so make that container `overflow: auto` (only where a field lives).
- The Final answer stage on the phone keeps the countdown above the field (already in the layout).

## Key files

`web/index.html`, `web/src/pages/HostLobby.tsx`, possibly `web/src/game/PlayerGame.tsx`, `web/src/game/FinalAnswerField.tsx`, a new `web/src/viewport.test.ts`.

## Contracts preserved

None touched.

## Success criteria

- On Android Chrome, focusing the Final answer, Join code, Join name and sign-in fields leaves the field and its submit button visible above the keyboard, with nothing to scroll.
- iPhone Safari at 390 × 844: no change (screenshot comparison before and after, Home, Join, Final).

## Test plan

- `web/src/viewport.test.ts`: reads `web/index.html` and asserts the viewport meta has `interactive-widget=resizes-content` and `viewport-fit=cover`. A regression guard for the one line that matters.
- `mise run test:web -- src/viewport.test.ts src/pages/HostLobby.test.tsx`.
- **Agent QA (local stack):** Playwright with `devices["Pixel 7"]` cannot open a real keyboard. Instead, emulate a 412 × 450 viewport (the height left above a keyboard) and check that Final, Join and sign-in fields and their buttons are in view once focused. Record it on the PR.
- **Human checklist:** a real Android phone in Chrome (QA's Fold 8). Type in the Final answer, Join and sign-in fields. Record it on the PR or the release notes.

## Database migration plan

None.

## Logging requirements

None.

## Docs to update

`docs/product-docs/architecture/design-system.md`: one line under layout saying screens follow the keyboard on Android (`interactive-widget=resizes-content`), and fixed-height containers holding a field must scroll.
