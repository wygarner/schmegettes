# Clue Catalog

Built in `worker/src/schmegettes_worker/clue_import.py` (rules) and `clue_load.py` (loading). Local development still starts with the seed's "SAMPLE" categories until real clues are loaded.

## Why

Every board is built from the catalog ([game history](../game-history/feature-brief.md)). A game uses 12 Single and Double categories and 1 Final, and the fresh-board rule means a group never sees the same category twice. So the catalog has to be large, and every category in it has to work on our screen: readable on the TV, answerable without anything we don't show, and free of the show we resemble.

## Jobs to be done

| Who | Job |
|---|---|
| Admin (us) | "I load every season into an environment with one command. Running it again changes nothing." |
| Host and contestants | "Every clue on the board can be answered from what the TV shows and reads aloud. No missing pictures, no sound cues, no instructions we never saw." |
| Everyone | "The game never names the show it resembles, not even inside a clue." |

## Rules

### Source

- The clue dataset repo, at the URL in `CLUE_DATASET_BASE_URL` (`worker/.env.example`): one file per season, `season1.tsv` to `season40.tsv` (1984–2024), about 523,000 clues.
- Not loaded: the special-matches file (different round numbering) and the kids/teen file (its clues are already in the season files).
- **Rights.** The clues belong to the show's producer, and the dataset asks not to be used in a public product. Decision (2026-11-09): we use it, and Schmegettes is private ([private access](../private-access/feature-brief.md)). **Production gets the catalog only after private access is live.** Local and staging can load it any time.

### What a clue keeps

Season, air date, round, category name, clue text, correct response, and its original value (used only to order the clues in a category). Text is cleaned: the dataset's backslash escapes are removed and whitespace is trimmed. Category names stay as aired (upper case).

Older seasons used half values (100–500). Players never see that: the board assigns values by row (200–800 Single, 400–1,600 Double).

### Which categories can reach a board

Boards are built from whole categories, so a problem with one clue keeps its **whole category** off every board. A category is never used when it:

| Rule | Why | Example | Share of Single/Double categories (season 1 / season 40) |
|---|---|---|---|
| Is **incomplete**: a Single or Double category with fewer than 5 clues | Clues not reached on air are missing; the board needs 4 clues in order | — | 34% / 8% |
| Has a **host note** | Notes often hold the instruction needed to answer ("each response rhymes"), and they name the host. Showing notes is a later enhancement. | `(Ken: "He's just 'Kin'.")` | 1% / 7% |
| **Names the show or its host**, in the category, a clue, or a response | Our own names ([product overview](../../architecture/product-overview.md), Principles) | A category titled after the show; a clue about its longtime host | under 1% |
| **Needs sound or a picture** | The TV shows text and reads it aloud; nothing else | `[Instrumental guitar opening plays]`, "Here is a map of this former country" | under 1% |

- Final categories have one clue; every rule but completeness applies.
- "Names the show" is checked on the word itself, in any form. Ordinary uses ("double jeopardy" in a law category) are dropped too. Losing a handful is cheaper than a miss.
- Measured on the full load (2026-11-10): **80,835 board categories and 8,801 Finals** (412,976 clues, about 160 MB). That's about 8,800 games before a group runs out of Finals. Left out: 15,534 incomplete, 6,116 with a host note, 3,365 naming the show (mostly on-location video clues), 230 needing sound or a picture.

### Loading

- One command per environment loads every season, or a chosen list. Only an admin runs it: `mise run clues:import -- --seasons 1-40` locally, the **Load Clues** workflow for staging and production ([deployment](../../system-docs/operations/deployment.md#loading-the-clue-catalog)).
- **Safe to run again.** A clue already loaded is never duplicated or changed, so players' seen-clue history stays valid.
- One season failing (download error, malformed file) doesn't undo the others. Running again finishes the job.
- Loading while games are in progress doesn't touch them. New categories are eligible from the next **Start**.
- Each run reports, per season: clues loaded, and categories left out under each rule above.
- Staging and production never contain the local "SAMPLE" seed categories.

### Who sees what

Unchanged: clue text and responses go only to the host device (the TV), and only when the clue is revealed. Phones see category names and values. Only the game server can read the catalog.

## Out of scope

- Showing host notes (a later enhancement would bring back the categories that have them)
- The special-matches file
- Difficulty tuning, or filtering out kids/teen tournament games
- An original clue set of our own
- An admin screen for the catalog, or a way for players to report a broken clue
