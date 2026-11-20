---
task-type: new-feature
task-title: "Stats and leaderboard for signed-in players"
---
**Task Type:** New Feature. Net-new player-facing capability (a Stats page and a leaderboard); previously listed as out of scope in game history.

**Depends on:** `accounts` (tasks/accounts/). Stats and the leaderboard are for signed-in players only.

**Product docs:** `docs/product-docs/features/stats-and-leaderboard/feature-brief.md` and `interaction-design.md`; `features/game-history/feature-brief.md` (out-of-scope line now links here).

**Problem:** Nothing adds up across games. Players can see each scoreboard but not how they're doing over time or how they compare with others.

**Outcomes:**
- A signed-in player sees their games, wins, win rate, scores, and accuracy.
- Everyone with an account and 10 finished games is ranked on one leaderboard by win rate.
- A player can hide from the leaderboard.
- Stats give guests a reason to sign in.

**Player flow:**
- Home gets **Stats** next to My games. `/stats` has tabs **You** and **Leaderboard** (`/stats/leaderboard`). Phones only; never in a room or on the TV.
- **Counted games:** finished games where the player was a contestant (a playing host counts). Abandoned, watched, and in-progress games don't count. Leaving mid-game still counts.
- **You:** Games, Wins (shared 1st counts), Win rate (rounded down); Average, Best (links to the game), Career total (can be negative); Correct answers in Single and Double ("62% · 124 of 200"), Daily Double record ("5–2"), Final Schmegettes record (only as a finalist). Right/wrong follow the final verdict including overrides; answers under appeal don't count until decided. Then the leaderboard rank, "Play N more games…", or "You're hidden…".
- **Leaderboard:** top 50 by win rate; ties → more wins → more games → shared rank. Rows: rank, name (account name), win rate, wins, games. My row highlighted "(you)", pinned below the top 50 if I'm lower. Visible only to signed-in players with at least one counted game.
- **Account page:** **Show me on the leaderboard**, on by default; off removes the player at once.
- **Guests:** both tabs say "Sign in to see your stats and the leaderboard." with **Sign in**.
- **Freshness:** a finished game is reflected within a minute.
- Edge cases (full list in interaction-design.md): no counted games → "Play a game to see your stats."; nobody qualifies → "Nobody's played 10 games yet."; guest and account in the same game → only the account's row counts; deleted account → removed, ranks below move up; rename → leaderboard updates at once, old scoreboards unchanged.

**Success Criteria:**
- For a seeded player, every stat matches a hand count from their scoreboards, including a shared 1st, an overridden verdict, a pending appeal, an abandoned game (excluded), and a watched game (excluded).
- A player with 9 counted games isn't on the leaderboard; after the 10th finishes they appear within a minute.
- Ties rank by wins, then games, then share a rank.
- Hiding removes the player immediately; deleting an account removes them and their stats.
- A guest, and a signed-in player with no counted games, can't read the leaderboard (UI and API).
- The leaderboard exposes only rank, account name, win rate, wins, and games: no user IDs that let a caller look up a player's games, and no emails.

**Out of scope:** weekly/monthly or per-group leaderboards; other rankings or sorting; other players' stats pages; category strengths, buzz speed, streaks, badges; stats on the TV; guests' stats; in-app reporting of names (admin renames or hides in the database).
