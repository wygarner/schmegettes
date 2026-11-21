---
task-type: enhancement
task-title: "A Home button on every screen"
---
# Task spec: home-from-every-screen

Product brief: `tasks/home-from-every-screen/product-brief.md`. Product docs: `docs/product-docs/features/navigation/feature-brief.md` and `interaction-design.md` (placement per screen, the confirmation, edge cases).

## Approach

Web only. No contract, database or server change.

**Going Home is a navigation, not a leave.** `useRoom` (`web/src/lib/room.ts`) already closes the socket on unmount without sending `leave_room`. So `navigate("/")` from any room screen does what the product asks:
- the server sees a disconnect: "(reconnecting)", the 10 s control rule, the wager rules, and a host pause;
- Home's current-room card offers **Rejoin** (from `GET /v1/me/current-room`).

`leave()` (which sends `leave_room`) stays wired only to the existing **Leave** buttons.

**One component, `HomeButton`** (`web/src/ui/HomeButton.tsx`):
- A 44 × 44 icon button with a house icon (add `home` to the `ICONS` set in `ui/menu.tsx`, matching the existing stroke style), `QUIET` color, no fill, `aria-label` and tooltip "Home".
- Props: `confirm?: "contestant" | "host"` and `disabled?: boolean`, plus `disabledHint` ("After your answer").
- Without `confirm`, a tap calls `navigate("/")`.
- With `confirm`, it opens a `Sheet` (`ui/Sheet.tsx`) titled "Leave the game?" with the copy from the interaction design: **Leave game** (`danger-solid`) and **Stay** (ghost). Leave game navigates to `/`. The sheet doesn't pause or block anything behind it, and it closes itself when `confirm` becomes undefined (the game ended).

**Where it goes:**

| Screen | File | Mode |
|---|---|---|
| `/join` | `pages/JoinCode.tsx` | plain |
| `/join/{code}` microphone, name, error states | `pages/JoinRoom.tsx`, `game/MicGate.tsx` (phone only) | plain |
| `/join/{code}` lobby ("You're in") | `game/PlayerControls.tsx` / `PlayerGame.tsx` header | plain |
| `/join/{code}` game phases `building_board` … `final_reveal`, paused | same | `confirm="contestant"`, `disabled` when `buzzerState(...) === "answering"` |
| `/join/{code}` `finished` | same | plain |
| `/host/{code}` lobby and resume lobby | `pages/HostLobby.tsx`, left of the Wordmark | plain |
| `/host/{code}` game phases | `game/HostGame.tsx` / `HostLayout.tsx`, top-left of the stage | `confirm="host"`; `disabled` when the host plays and `state.answeringUserId === userId` in `answering` |
| `/host/{code}` `finished` | same | plain |
| `/games/{id}` | `pages/GameScoreboard.tsx` | plain, top bar right, beside "‹ My games" |
| `/stats/leaderboard` | `pages/Stats.tsx` | already "‹ Home" via `MenuScreen`; check only |
| `/games`, `/stats`, `/account` | `MenuScreen back` | already "‹ Home"; unchanged |

Add an optional `right` slot to `MenuScreen`'s top bar for `/games/{id}`, rather than special-casing the page.

**In-game test:** a phase is "in a game" when `state.phase` isn't `lobby` or `finished` (closed and error states are plain).

**Placement:** on the host stage it sits in the top-left corner outside the board's grid, and at 667 × 320 it must not overlap the board, a clue, the code, the HomeScreenTip ✕, or the player column. On phones it sits in the top-left of the status header, never in the buzzer area.

## Subtasks (narrow → wide)

1. **web:**
   - `ui/menu.tsx`: the `home` icon and the `MenuScreen` `right` slot
   - `ui/HomeButton.tsx`
   - wire it into each screen in the table
2. **docs:** see "Docs to update".

## Key files

`web/src/ui/HomeButton.tsx` (new, + test), `web/src/ui/menu.tsx`, `web/src/pages/JoinCode.tsx`, `JoinRoom.tsx`, `HostLobby.tsx`, `GameScoreboard.tsx`, `web/src/game/PlayerControls.tsx`, `PlayerGame.tsx`, `HostGame.tsx`, `HostLayout.tsx`, `MicGate.tsx`, and their existing tests.

## Contracts preserved

All of them. No change to `shared/`, `api/`, `game/` or `supabase/`.

## Success criteria

- The product brief's success criteria.
- No screen calls `leave()` from the Home button. `leave_room` is sent only by the existing Leave buttons.
- After Leave game, Home shows the current-room card within a second, and Rejoin restores the same seat.

## Test plan

- `mise run test:web -- src/ui/HomeButton.test.tsx`:
  - plain mode navigates to `/`
  - confirm mode opens "Leave the game?", **Stay** keeps the route, **Leave game** navigates
  - disabled does nothing and exposes "After your answer"
  - the sheet closes when `confirm` goes undefined
- `mise run test:web -- src/pages/HostLobby.test.tsx src/pages/JoinRoom.test.tsx src/pages/JoinCode.test.tsx src/game/HostGame.test.tsx src/pages/GameScoreboard.test.tsx`:
  - a "Home" button on each screen
  - confirm in game phases and not in the lobby or finished
  - disabled while the user is answering
  - `leave_room` is never sent by Home
- **Agent QA** (`docs/system-docs/quality/agent-qa.md`):
  - every route at 375 px (phone) and 667 × 320 / 844 × 390 (host)
  - a mid-game Leave game and Rejoin as a contestant, and as the host (the game pauses, then resumes)

## Database migration plan

None.

## Logging requirements

None. The server already logs disconnects and reconnects.

## Docs to update

- `docs/product-docs/features/navigation/feature-brief.md` and `interaction-design.md`: remove "Not built yet …", and describe the behavior as built
- `docs/product-docs/architecture/design-system.md` "Headers": the Home control (house icon button on game screens; `MenuScreen` `right` slot)
