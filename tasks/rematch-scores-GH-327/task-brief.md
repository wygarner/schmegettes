---
task-type: bug-fix
task-title: "Scores reset to $0 as soon as the host presses Rematch"
---
# Task spec: rematch scores

Product brief: [product-brief.md](product-brief.md).

## Subtasks

### 1. `web/`: a snapshot without scores means $0

In `reduceRoom` (`web/src/lib/room.ts`), `room_snapshot` takes `event.scores ?? state.scores`. The server leaves `scores` out of a snapshot only when it has no game (`game/internal/play/game.go` fills it whenever a game exists): the lobby, and every socket's snapshot right after `rematch` (`game/internal/room/room.go`, `rematch`). Keeping `state.scores` left last game's totals on screen in the rematch lobby until the next Start.

Change it to `event.scores ?? {}`. A snapshot is already "the whole truth" for everything else in the reducer, and scores now follow that rule.

Nothing else changes. Mid-game and finished-game snapshots (reconnect, resume, the final scoreboard) always carry `scores`.

## Key files

| Subtask | Files |
|---|---|
| 1 | `web/src/lib/room.ts`, `web/src/lib/room.test.ts` |

## Contracts preserved

No `shared/`, REST or socket contract change. No server change.

## Success criteria

- After **Rematch**, every score on the TV and on phones is $0 as soon as the lobby appears.
- A reconnect mid-game, a resumed game, and a reconnect on the final scoreboard show the same scores as before.

## Test plan

- `web/src/lib/room.test.ts`: a finished snapshot with scores, then a lobby snapshot without scores, leaves `scores` empty (every player at $0). The existing test, where a reconnect on the final scoreboard rebuilds results from the scores, still passes.
- Run `mise run test:web -- src/lib/room.test.ts src/lib/gameSocket.test.ts`.

## Database migration plan

None.

## Logging requirements

None. No logs or failure paths change.

## Docs to update

None. `scoreboard-and-overrides/feature-brief.md` (Rematch: "scores at $0") and `realtime-game-server.md` (`rematch`: "a fresh `room_snapshot` in `lobby` at $0") already describe the fixed behaviour.

## Branch
`bug-fix/GH-327-rematch-scores`, from and into `develop`
