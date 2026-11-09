---
jira-type: new-feature
jira-title: "Design pass 3/3: My games"
---
**Task Type:** New Feature. Part 3 of the design pass (1: [restyle](../design-pass-restyle/product-brief.md), which ships first; 2: [scoreboard, Rematch, overrides](../design-pass-endgame/product-brief.md)). Players can't look back at past games today.

**Problem:** Every game is recorded with its players, scores and placements ([game history](../../docs/product-docs/features/game-history/feature-brief.md)), but nothing in the app shows them.

**Outcomes:**

- Players open **My games** from Home and see every game they played or watched.
- Tapping a game opens its scoreboard.

**Player flow:** rules in [game history](../../docs/product-docs/features/game-history/feature-brief.md) ([interaction design](../../docs/product-docs/features/game-history/interaction-design.md), "Look back at past games"). Visual reference: `devtools/src/designs/results/scoreboard-and-history.tsx` ("My games").

- Home → **My games** → rows: placement badge (gold 1st, silver 2nd, bronze 3rd), date and time ("Today"), Unfinished tag, players with "You" in place of my name, my score; WATCHED badge and no score for games I only watched. Newest first, 20 at a time, **Show more**.
- Tap → scoreboard: "‹ My games", date · start time · length, "Hosted by {name}", rows with placement, name, score, my row highlighted "(you)", 🏆 for 1st (not on unfinished games), "Former player" in italics, the Unfinished or "You watched this game" note.
- Empty: "No games yet. Games you play or watch show up here, with everyone's scores." and **Join a game**.
- Anonymous players see "Played without an account. Link Google or email to keep these if you switch phones." (no linking flow).

**Success Criteria:**

- My games lists a player's played and watched games, newest first, 20 per page, with ties, Unfinished and Former player as in the docs.
- A player can't open the scoreboard of a game they didn't play or watch (404).
- Names are as they were in that game.

**Out of scope:** account linking, stats across games, public or shareable results, deleting history.
