---
task-type: enhancement
task-title: "My games: remove the Watched filter"
---
**Task Type:** Enhancement. Simplifies the existing My games list, from QA on 2026-11-21.

**Product docs:** [game-history/interaction-design.md](../../docs/product-docs/features/game-history/interaction-design.md) (PR #269). Remove its "Not yet implemented (task `my-games-drop-watched-filter`)" note when it ships.

**Problem:** The All / Played / Watched filter above My games is clutter for a list most players scroll in seconds, and "Watched" reads as its own section that few people need.

**Outcomes:**
- My games has no filter: stats, then the games by month.
- Watched games stay in the list with their eye tile and **Watched** chip. A host who didn't play still finds an unfinished game there and presses **Resume game**.

**Player flow:**
- A player opens My games: the three stat tiles, then NOVEMBER 2026 with every game, played and watched, newest first, 20 at a time, **Show more**. No segmented control.
- A player who only ever watched sees their watched games, as today under All. The empty state is unchanged.
- A device that last had Played or Watched selected opens the full list.

**Success Criteria:**
- `/games` shows no filter at 375 px wide and up, and the list is the same as today's **All**.
- A non-playing host's unfinished game is listed and its page still offers **Resume game**.
- The stats tiles are unchanged.
- Whether `GET /v1/games` keeps its `kind` parameter is an engineering call; the page no longer uses it.

**Out of scope:** Hiding watched games; changing the stats; any other filter or search.
