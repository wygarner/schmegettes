---
jira-type: enhancement
jira-title: "Easy, Medium and Hard clue difficulty"
---
**Task Type:** Enhancement. It adds to two existing features: the clue catalog gets a difficulty label per category, and the lobby's game options get a Difficulty setting.

**Product docs:**
- `docs/product-docs/features/clue-catalog/feature-brief.md` ("Difficulty", "Rating (admin)") and `interaction-design.md` ("Rating the catalog")
- `docs/product-docs/features/game-history/feature-brief.md` ("Building a fresh board")
- `docs/product-docs/features/lobby/feature-brief.md` ("Game options") and `interaction-design.md` ("Game options (host device)", edge cases)

**Problem:** Every board is drawn from the whole catalog, from 40 years of regular games and tournaments, with nothing to say how hard a category is. A casual group can get a board of obscure categories, and a group of regulars can get one that's too easy. The host has no way to pick, and the catalog keeps no difficulty signal it could use.

**Outcomes:**
- Every category that can reach a board has a label: **Easy**, **Medium** or **Hard**. Claude rates each category from its text, and the labels split the catalog into roughly equal thirds.
- The host picks a difficulty in game options (default **Medium**). Single, Double and Final are all built from that level.
- The fresh-board rule still comes first: a fresh category one level off beats a repeat, and the game always starts.

**Player flow:**
- **Lobby (host device).** ⚙ opens Game options, which now has **Difficulty: ( Easy | Medium | Hard )**, with Medium selected the first time. The line below describes the choice ("Clues most people know" / "A mix most groups will enjoy" / "For trivia regulars"). With Easy or Hard picked, the line under the code shows it ("Easy · Seasons 20–40"). The device remembers the choice, a Rematch keeps it, and it locks at **Start**. Phones never show it.
- **Start.** The board is built from unseen categories at the chosen level, for every round. If a level runs short (most likely with a narrow Seasons range), the board takes unseen categories from the next level over: Medium for Easy or Hard, and Easy or Hard at random for Medium. Only after that does it fall back to least-recently-seen categories at any level. Start never fails because of difficulty.
- **In game.** Nothing visible changes. Values, Daily Doubles, timers, judging and scoring are the same at every level, and the board, TV and phones never show a category's label. A disconnect, reload, pause or resume behaves as it does today, because the board was fixed at Start.
- **Unrated categories** (loaded after the last rating run, or every category before the first run) play as **Medium**. Local, staging and production work before any rating has run.
- **Admin rating run.** This is a separate, idempotent run after a load: a `mise` task locally and a **Rate Clues** workflow for staging and production. It labels only categories that have no label yet, never changes a label once given, picks up after an interruption, and reports how many it labelled per level, how many failed, and how many are still unrated. A category that fails stays unrated and is retried on the next run. Rating judges the category name plus the first 4 clues and responses (the Final's 1 clue), because those are what reach the board.
- **Quality gate before Easy and Hard go live in an environment.** (1) Rate a sample of individual clues: the ratings rise with the show's row order inside categories. (2) A human hand-labels 60 categories (20 per level) without seeing Claude's label, and agrees with Claude on at least 45. If either check fails, the rating is redone before the labels go live.

**Success Criteria:**
- After a full rating run on the full catalog, each level holds 28–38% of board categories and 28–38% of Finals, and **still unrated** is 0.
- Both quality-gate checks pass, with the results recorded in the PR.
- A second rating run right after the first labels 0 categories and changes no labels.
- With Easy picked and every season allowed, all 11 categories in a game (5 Single, 5 Double, 1 Final) are Easy unless the fallback applied. The same holds for Medium and Hard.
- With Hard and a one-season range, repeated rematches show unseen Hard categories, then unseen Medium ones, then repeats, and Start never fails.
- Saved options from before this change open as Medium. A resumed game keeps the board it started with.
- The options sheet still fits 844 × 390 without scrolling, and the line under the code reads correctly for every combination.
- No player-facing surface shows a category's label. No player data is sent to Claude.

**Out of scope:** Difficulty from play results (ours or the original contestants'); a difficulty per clue or per row; a mixed or ramping level (Easy Single, Hard Final); showing labels to players; scoring, stats or leaderboard changes by difficulty; filtering out kids/teen tournaments; an admin screen to review or relabel categories; rating categories that can never reach a board.
