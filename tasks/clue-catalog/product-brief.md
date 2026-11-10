---
jira-type: new-feature
jira-title: "Load the real clue catalog from the clue dataset"
---
**Task Type:** New Feature. Players get net-new content: real clues replace the "SAMPLE" seed categories. Most of the work is in the worker, but the outcome is player-facing.

**Product docs:** [feature brief](../../docs/product-docs/features/clue-catalog/feature-brief.md), [interaction design](../../docs/product-docs/features/clue-catalog/interaction-design.md)

**Problem:** Every board is built from `public.clues`, which holds only local seed data. The worker can parse a season file (`clue_import.py`), but nothing downloads, filters, or saves one, so no environment can host a real game. Some aired categories also can't work on our screen: they rely on a host note, a picture, or a sound, or they name the show we never name.

**Outcomes:**
- One admin command loads all 40 season files (or a chosen list) from `CLUE_DATASET_BASE_URL` into an environment's catalog. Running it again changes nothing.
- No category that breaks a content rule ever reaches a board.
- Local and staging run on real clues. Production loads only after private access ([private-access](../private-access/product-brief.md)) is live.

**Player flow:**
- Players: unchanged except for the content. Start builds the board from real categories, and the clue text shown and read on the TV is the aired text, cleaned.
- Admin: run the load → per-season summary (clues read, categories kept, left out by rule) → run again to retry failures. States per season: `pending → downloading → checking → loaded | failed`.
- Content rules (whole category is left out if any clue trips one):
  1. Single/Double category with fewer than 5 clues (already enforced by `build_board_round`)
  2. Any clue in it has a host note (`comments` column not empty)
  3. The category, a clue, or a response contains the show's name in any form, its longtime host's surname, or its clue-presenting team's name
  4. Needs sound or a picture: bracketed stage directions (`[…]`) or phrasing like "seen here", "shown here", "heard here", "pictured", "this photo", "on the monitor", "here is a map"
- Edge cases:
  - Re-running a season: no duplicates, no changed clue ids (`source_key` upsert), so `seen_clues` stays valid.
  - A season fails partway (network, bad file): other seasons stay loaded. Re-run finishes.
  - A load during live games: no effect on boards already built. New categories count from the next Start.
  - Upstream edits a clue's text: it loads as a new row. Its category then has 6 clues and is left out by rule 1. It never reaches a board with a duplicate.
  - Text: strip backslash escapes, trim whitespace. On the samples, no HTML entities were found.

**Success Criteria:**
- Staging holds all 40 seasons. Running the load a second time reports 0 new clues.
- Starting 100 games in staging gives boards with no "SAMPLE" category. None of their clues match rules 2–4.
- A test with a fixture TSV covers each rule, the re-run case, and one failing season among good ones.
- The run's summary per season roughly matches the measured samples: season 1 keeps ~1,205 Single/Double categories and 163 Finals; season 40 keeps ~2,336 and 230.
- Start still builds a board in under 3 s with the full catalog (game-history target).
- Staging and production contain no seed (`seed-*`) clues.

**Out of scope:** showing host notes (later enhancement); the special-matches and kids/teen files; season choice in the lobby UI; difficulty tuning; an original clue set; an admin UI or player "report a clue"; the worker's pgmq queue loop, unless engineering finds it the simplest way to run the load.

**Assumptions:**
- Excluded categories may be skipped at load time or stored and flagged. Either is fine as long as they never reach a board and the summary counts them.
- The seed clues stay for local development. Real clues can also be loaded locally.
- The full catalog (~520k clues) fits the Supabase plan's database size. Engineering should check this before the staging load.
