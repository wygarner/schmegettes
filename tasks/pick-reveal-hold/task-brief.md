---
jira-type: enhancement
jira-title: "Pick card holds 0.75 s longer"
---
# Task spec: pick-reveal-hold

Product brief: `tasks/pick-reveal-hold/product-brief.md`. Product docs: `docs/product-docs/features/gameplay/feature-brief.md` ("Reading and buzzing", "The narrator's voice") and `interaction-design.md` (timing table, pick reveal), merged in #194.

## Approach

The reveal's length lives in one constant on each side, and everything else derives from it:
- server: `play.PickReveal` → `revealUntil`, the reading deadline (`revealUntil + ReadingTime`), and the early-buzz window;
- web: `PICK_REVEAL_MS` → `usePickReveal`, the TV card and the phone's "Volcanoes for $400".

The card's hold isn't its own constant. It's whatever is left after the blink (`PICK_BLINK_MS`, 600) and the grow (`GROW_MS`, 600 in `PickReveal.tsx`). So 1500 → 2250 on both sides gives blink 0.6 s, grow 0.6 s, hold 1.05 s, as specified. Daily Doubles use `PickBlink` only and are untouched.

Narrator: since #191 (merged), the host prepares the clue during the reveal and starts it when `usePickReveal` ends. A longer reveal only gives it more time. `PIPER_START_TIMEOUT_MS` (1.5 s) is unrelated and stays.

Deploy order: the server and web constants should match. If the game server deploys first, buzzing can't open before 2.25 s + reading anyway, and an old web would show the clue 0.75 s earlier while the server still waits for the reveal. Harmless either way, so no feature flag. Ship both in one PR.

## Subtasks (narrow → wide)

1. **game**: `game/internal/play/game.go`: `PickReveal = 2250 * time.Millisecond`; update its comment (blink 0.6 s, grow 0.6 s, hold 1.05 s).
   - Fix tests that hard-code 1.5 s: `game/internal/play/game_test.go`, `game/internal/room/room_test.go`. Prefer `PickReveal` over literals.
   - Add or adjust one test: a `reading_done` at +2.0 s after the pick doesn't open buzzing before +2.25 s; with no `reading_done`, the fallback deadline is `pick + 2.25 s + ReadingTime(clue)`; a buzz at +2.0 s is an early buzz (lockout).
2. **web**:
   - `web/src/game/timing.ts`: `PICK_REVEAL_MS = 2250`; update the comment.
   - `web/src/game/HostGame.tsx`: the comment at ~line 169 ("this is the 1.5 s reveal") becomes 2.25 s.
   - `web/src/game/PickReveal.tsx`: no logic change. Check the reduced-motion path (fade-in, then hold) still runs for the full `PICK_REVEAL_MS`.
   - Tests that assume 1500: `web/src/game/HostGame.test.tsx`, `web/src/game/PlayerControls.test.tsx`, `web/src/lib/room.test.ts`, `web/src/lib/sfx.test.ts`. Use the constant where they advance fake timers.
3. **docs**: `docs/system-docs/architecture/realtime-game-server.md` ("Pick reveal and clue end"): `+1.5 s` → `+2.25 s`.

## Key files

`game/internal/play/game.go`, `game/internal/play/game_test.go`, `game/internal/room/room_test.go`, `web/src/game/timing.ts`, `web/src/game/HostGame.tsx`, `web/src/game/PickReveal.tsx`, and the web tests above; `docs/system-docs/architecture/realtime-game-server.md`.

## Contracts preserved

No change to `shared/`, the database, or any message: `revealUntil` is already a timestamp the server sends, and only its value moves.

## Success criteria

As in the product brief:
- on the TV, the card is still for ≥ 1 s and the clue appears 2.25 s (±0.1 s) after the pick;
- a buzz during the hold is early;
- buzzing never opens before 2.25 s + the reading;
- the fallback is 2.25 s + the estimate;
- Daily Double timing is unchanged.

## Test plan

- `mise run test:game -- ./internal/play/... ./internal/room/...`
- `mise run test:web -- src/game/HostGame.test.tsx src/game/PlayerControls.test.tsx src/lib/room.test.ts src/lib/sfx.test.ts`
- Manual (staging, iPhone host): pick 5 clues including a long one; time the card hold; confirm the narrator starts within 1 s of the clue appearing, and a press during the hold gives the early-buzz shake.

## Database migration plan

None.

## Logging requirements

No change.

## Docs to update

`docs/system-docs/architecture/realtime-game-server.md` as above. Product docs are already merged.

## Branch
`enhancement/pick-reveal-hold-impl`, from and into `develop`. No Jira key: Jira is not configured yet (`.github/jira.json` issue types are `REPLACE_ME`), so `create-ticket` fails on this PR as expected.
