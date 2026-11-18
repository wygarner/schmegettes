---
jira-type: enhancement
jira-title: "Five categories per board, with wider columns"
---
**Task Type:** Enhancement to gameplay and the board builder (game history).

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md` (The board and control), `features/gameplay/interaction-design.md` (Board), `features/game-history/feature-brief.md` (Building a fresh board), `architecture/product-overview.md`, `architecture/design-system.md` (Board).

**Problem:** Six categories make narrow cells on the host's iPhone; headers wrap to three lines and shrink. QA (2026-11-18): "5 categories instead of 6. The board should expand horizontally."

**Outcomes:** A Single and a Double board of 5 categories × 4 clues, filling the stage's full width.

**Player flow:**
- Single 200–800 and Double 400–1,600, 5 columns × 4 rows. Daily Doubles unchanged: 1 on Single, 2 on Double, different categories, never the top row.
- **TV:** the five columns share the stage width (each about a fifth wider than now); headers wrap less. The player column is unchanged.
- **Phone mini board:** 5 columns.
- **Spoken pick** works unchanged with 5 categories.
- A game is 40 board clues + Final (was 48 + Final).
- Games already in history keep the board they had. Nothing that shows a past game assumes a column count.

**Success Criteria:**
- Every new board has exactly 5 categories per round, with Daily Doubles placed by the existing rules.
- Host board at 667 × 320, 844 × 390 and 956 × 440: 5 columns span the stage, no scrolling, all 4 rows visible with 6 contestants.
- A game started before the change and still running (or resumed later) plays to the end on its 6-column board.

**Out of scope:** changing rows or values, a setting for the number of categories.
