---
task-type: bug-fix
task-title: "Scores reset to $0 as soon as the host presses Rematch"
---
**Task Type:** Bug Fix. QA (production, 2026-11-28): "Scores don't immediately reset on rematch."

**Product docs:** `docs/product-docs/features/scoreboard-and-overrides/feature-brief.md` (Rematch: "everyone still in the room returns to the lobby, scores at $0"). No doc change: the docs are right and the app is wrong.

**Problem:** After **Rematch**, the lobby on the TV and on phones still shows last game's scores until the next game starts. The server sends the lobby snapshot without scores (there's no game), and the web app keeps the scores it already had when a snapshot has none (`web/src/lib/room.ts`, `reduceRoom`, `room_snapshot`: `event.scores ?? state.scores`).

**Outcomes:** Every score shows $0 the moment the rematch lobby appears, on every screen.

**Player flow:**
- Host presses **Rematch**. TV and phones show the rematch lobby with every player at $0, at once.
- A phone that reconnects into the rematch lobby also shows $0.
- The finished game's scoreboard and history are unchanged: My games still shows last game's final scores.

**Success Criteria:**
- A `room_snapshot` in `lobby` with no `scores` clears every score to $0. A unit test in `web/src/lib/room.test.ts` covers rematch after a finished game.
- A `room_snapshot` mid-game still uses the scores it carries (reconnect and resume are unchanged).
- The E2E suite (or a unit test of the host and phone lobby screens) shows $0 after Rematch.

**Out of scope:** any server change. The server already resets correctly.
