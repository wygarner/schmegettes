---
jira-type: enhancement
jira-title: "Home Screen tip for full screen on iPhone and iPad Safari"
---
# Task spec: ios-home-screen-tip

Product brief: `tasks/ios-home-screen-tip/product-brief.md`. Rules: `docs/product-docs/features/lobby/feature-brief.md#full-screen-on-iphone-and-ipad` and `interaction-design.md` (Home Screen tip).

## Approach

Client only. `web/src/lib/fullscreen.ts` already handles every browser with a fullscreen API and the installed app (`display-mode: fullscreen/standalone`); iPhone Safari has neither. Add a detector and a dismissible banner in the host lobby.

- `needsHomeScreenTip(win)`: true when the device is iOS/iPadOS (`/iPhone|iPad|iPod/` in the user agent, or `Macintosh` with `navigator.maxTouchPoints > 1` for iPadOS), the page is **not** installed (`navigator.standalone !== true` and the existing `installed(win)` check is false), and the browser is Safari (not `CriOS`/`FxiOS`/`EdgiOS`; those can't add to the Home Screen the same way. Show nothing there).
- Dismissal: `localStorage` key `schmegettes.homeScreenTip.dismissed = "1"`, read and written in try/catch (private mode can throw). Missing storage → show the tip (it's harmless).
- `HomeScreenTip` banner at the top of the host lobby's stage, above the title, per the interaction design: "⤴ For full screen, add Schmegettes to your Home Screen: tap Share, then Add to Home Screen." with ✕. It must not push the room code off screen at 667 × 320 (one line at that width; truncate the second sentence if needed).
- Only `HostLobby`. Never on `JoinRoom`, in a game, or in the Home Screen app.

**Home Screen app storage.** iOS gives the installed app its own storage and cookies: the host signs in or redeems a host code there once, and the voice downloads there once. Confirm the app's start page (`start_url: "/"`, Home) leads to **Host a game** → the existing host-code flow when the session has no host access. No code change is expected; record the check in the PR.

## Subtasks

1. **web: detector** (`web/src/lib/fullscreen.ts`): export `needsHomeScreenTip(win = window)` and reuse `installed()`.
2. **web: banner** (new `web/src/ui/HomeScreenTip.tsx`): copy, ✕, dismissal storage, compact layout.
3. **web: lobby** (`web/src/pages/HostLobby.tsx`): render it when `needsHomeScreenTip()` and not dismissed.
4. **docs**.

## Key files

`web/src/lib/fullscreen.ts` (+ `fullscreen.test.ts`), new `web/src/ui/HomeScreenTip.tsx` (+ test), `web/src/pages/HostLobby.tsx`.

## Contracts preserved

No change to `shared/`, REST, WebSocket, or the database.

## Success criteria

- The banner shows on iPhone Safari and iPad Safari in the host lobby; nowhere else (desktop, Android, Chrome/Firefox on iOS, Home Screen app, joining phones, in a game).
- ✕ hides it across reloads on that device.
- From the Home Screen on an iPhone, the host screen has no Safari toolbar, and a fresh install leads the host through sign-in / host code to a lobby.

## Test plan

- `web/src/lib/fullscreen.test.ts`: iPhone Safari UA → true; iPadOS (`Macintosh` + touch points) → true; `navigator.standalone` → false; display-mode standalone → false; CriOS → false; desktop Safari / Android Chrome → false.
- `web/src/ui/HomeScreenTip.test.tsx`: renders copy; ✕ hides and persists; storage that throws doesn't crash.
- `web/src/pages/HostLobby.test.tsx`: shown only when the detector says so.
- `mise run test:web -- src/lib/fullscreen.test.ts src/ui/HomeScreenTip.test.tsx src/pages/HostLobby.test.tsx`
- By hand: iPhone Safari against staging (tip, ✕, Add to Home Screen, open from the icon, host a game).

## Database migration plan

None.

## Logging requirements

None.

## Docs to update

- The comment at the top of `web/src/lib/fullscreen.ts` (mention the tip).
- `docs/system-docs/` only if it describes full-screen handling (`grep -rn -i "fullscreen\|home screen" docs/system-docs`).

## Branch

`enhancement/ios-home-screen-tip-impl`, from and into `develop`. Jira isn't set up yet (`.github/jira.json` issue types are `REPLACE_ME`), so there's no `SCH-{N}`: the folder keeps its name, and the PR title is `[Enhancement] ios-home-screen-tip: …`.
