---
jira-type: new-feature
jira-title: "Fresh boards: never repeat a clue, backed by durable game history"
---
**Task Type:** New Feature

**Problem:** Players should never get a clue they have already seen. Today nothing records which clues a player has seen, or any game results at all: the schema has tables for games and scores, but no code writes them, and the design loses history easily (deleting a room or user erases games; leaving a room hides your own history; results are only written when a game ends; a room can hold only one board). Boards are also built when a room is created, before anyone has joined, so they can't take the players into account.

**Durable docs:** `docs/product-docs/features/game-history/feature-brief.md` and `interaction-design.md` hold the full rules. This brief is the scope for the first implementation.

**Outcomes:**

- Every new board contains only categories none of its contestants has seen, when the catalog allows; otherwise it falls back to the longest-ago, least-seen categories and still starts.
- A clue counts as seen by everyone in the game (contestants, host, spectators) once it is revealed. Unplayed clues are not seen.
- The board is built when the host presses Start. A room can host many games (rematch) with a fresh board each.
- Every game is recorded from the moment it starts: each revealed clue and judged answer is stored as it happens. Games end as `finished` or `abandoned`; both stay in history.
- Each result keeps the player's name from that game. Final score equals the sum of their scored answers. Ties share a placement.
- Everyone who played or watched a game can see its date, players, scores, and placements permanently, even after leaving or the room closing. Each player can list their past games.
- Deleting a room never deletes games. Deleting an account keeps their results on others' scoreboards as "Former player" and deletes their seen-clue record.

**Player flow:** Host presses Start → everyone sees "Shuffling a fresh board…" (target under 3 s; joining closes) → board appears → play. If building fails, everyone returns to the lobby with "Couldn't build a board. Try again." and nothing is marked seen. On the final scoreboard the host can Rematch, which returns players to the lobby, and the next Start builds a new fresh board. From home, "My games" lists past games newest first (date, placement, score, players, "Unfinished" tag) and opens a scoreboard. Edge cases (disconnects, leaving mid-game, ties, overrides, late joins) are in `interaction-design.md`.

**Success Criteria:**

- Two games played back to back by the same group share no revealed clue, and the second board contains no category with a clue revealed in the first.
- A player who played with group A, then plays with group B, gets no clue they saw with group A.
- A game abandoned halfway appears in history as Unfinished with scores at that point, and its revealed clues count as seen.
- After a contestant leaves the room, and after the room is closed, they can still open that game's scoreboard.
- After a player renames themselves, old scoreboards show the old name.
- Deleting a user leaves "Former player" rows on other players' scoreboards; deleting a room leaves its games intact.
- A game's recorded final scores always equal the sum of its answers' score changes, including after a host override.
- Board build finishes in under 3 s with a full catalog (all imported seasons) and 6 contestants with long histories.

**Out of scope:** Real-episode boards ("play the March 4, 1998 episode"); public or shareable results pages; cross-game stats and leaderboards; resetting your seen clues; showing players how many clues they've seen; anonymous-account cleanup jobs (only the rule they must follow is in scope).
