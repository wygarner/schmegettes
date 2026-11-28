---
task-type: enhancement
task-title: "The wager pad stops at the limit"
---
# Task spec: wager pad limit

Product brief: [product-brief.md](product-brief.md). Rule: `docs/product-docs/features/wagers/interaction-design.md` (Number pad).

## Subtasks

### 1. `web/`: refuse digits past the limit

In `WagerPad` (`web/src/game/WagerPad.tsx`), `press(key)` appends any digit (up to 7). Change it:

- A digit whose result would be greater than `max` isn't added. Instead the amount shakes once: a 300 ms horizontal shake as a CSS keyframe on the amount element, re-triggered per refused press. With `prefers-reduced-motion: reduce`, there's no shake. The hint shows "At most {money(max)}" while the shake plays, then returns to the range hint.
- Masked pad (the host's Final wager): the same rule. The shake moves only the fixed `$ •••••`, and the hint stays generic ("Over the limit"), so the amount and limit are never revealed.
- Backspace, **Min** and **Max** are unchanged. Below `min` stays allowed while typing, with **Wager** disabled and "At least {money(min)}".
- Leading zeros still drop.

### 2. `game/`: confirm the server's check is tested

`play.Game.Wager` already rejects out-of-range wagers. If no test covers a Daily Double wager above `ddMax`, add one in `game/internal/play/wager_test.go` (expected: the existing rejection code, and no wager locked).

## Key files

`web/src/game/WagerPad.tsx`, `web/src/game/WagerPad.test.tsx`, possibly `web/src/ui/kit.css` (keyframe), `game/internal/play/wager_test.go`.

## Contracts preserved

None touched.

## Success criteria

- With max $800, typing 8, 0, 0, 0 shows $800; the last 0 is refused, and the hint says "At most $800".
- With max $1,200 and the amount at $120, a 0 gives $1,200, and another 0 is refused.
- The masked pad refuses the same digits without showing the amount or the limit.
- The server rejects a Daily Double wager above the limit (test).

## Test plan

- `mise run test:web -- src/game/WagerPad.test.tsx`: the cases above, plus Min and Max unchanged, and below-min still typeable.
- `mise run test:game -- ./internal/play/...`: the over-limit wager test.

## Database migration plan

None.

## Logging requirements

None.

## Docs to update

`docs/product-docs/features/wagers/interaction-design.md`: remove **Not yet implemented** (`wager-pad-limit`) from Number pad.

## Branch
`enhancement/GH-337-wager-pad-limit`, from and into `develop`
