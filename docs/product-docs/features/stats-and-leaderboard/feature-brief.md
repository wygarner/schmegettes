# Stats and Leaderboard

## Why

Players come back to a quiz night to find out who's best. Today each game's scoreboard is all there is: nothing adds up across games. Stats show a player how they're doing over time, and the leaderboard ranks everyone with an account against each other.

Both are built on [accounts](../accounts/feature-brief.md): they follow a player across devices, which a guest can't. They're also the main reason to sign in.

## Jobs to be done

| Who | Job |
|---|---|
| Signed-in player | "I can see how many games I've played and won, my scores, and how often I'm right." |
| Signed-in player | "I can see where I rank against everyone else on Schmegettes." |
| Signed-in player | "I can keep myself off the leaderboard." |
| Guest | "I can see what I'd get by signing in." |
| Admin (us) | "I can rename or hide a player whose name shouldn't be on the leaderboard." |

## Rules

### Which games count

- **Finished games where the player was a contestant.** A host who joined the game counts as a contestant ([lobby](../lobby/feature-brief.md)).
- **Not counted:** abandoned (unfinished) games, games the player only watched or hosted without playing, and games still in progress. They stay in My games as today.
- A contestant who left mid-game still counts. Their score and placement are on that game's scoreboard, so they count here too.
- A guest's games count once they belong to the account: kept at first sign-in, or moved in on a returning sign-in ([accounts](../accounts/feature-brief.md#signing-in-keeps-everything)).
- Stats always come from the recorded answers, the same source as every scoreboard, so a host override is reflected everywhere ([game history](../game-history/feature-brief.md#game-history)).

### Stats

| Group | Stat | Definition |
|---|---|---|
| Games | **Games** | Counted games |
| | **Wins** | Counted games finished in 1st place, shared 1st included |
| | **Win rate** | Wins ÷ games, as a whole percent (rounded down, so 99.6% shows 99%) |
| Scores | **Average score** | Mean final score, rounded to the nearest dollar |
| | **Best score** | Highest final score, with a link to that game |
| | **Career total** | Sum of all final scores; can be negative |
| Accuracy | **Correct answers** | Right ÷ judged answers in Single and Double, as a percent, with the counts ("62% · 124 of 200") |
| | **Daily Doubles** | Right–wrong record ("5–2") |
| | **Final Schmegettes** | Right–wrong record, only games where they were a finalist |

- **Right** is a correct verdict, including one the host overrode to correct. **Wrong** is an incorrect verdict, including one overridden to incorrect. An answer still under appeal doesn't count until it's decided.
- Answers count exactly as the game judged them. "No answer heard" is incorrect, so it counts as wrong; a buzz voided by the disconnect exception isn't an answer and doesn't count ([gameplay](../gameplay/feature-brief.md)).
- Stats are up to date within a minute of a game finishing.
- With no counted games, Stats shows "Play a game to see your stats." (not zeros).

### Leaderboard

- **One leaderboard for everyone** on Schmegettes with an account (owner's choice, 2026-11-10).
- **Who's on it:** signed-in players with at least **10 counted games** who haven't hidden themselves. Below 10: "Play 7 more games to get on the leaderboard."
- Dedicated QA accounts never appear on the leaderboard and never shift a real player's rank.
- **Ranked by win rate.** Ties go to more wins, then more games; still tied, they share a rank (two players at 4th, the next is 6th).
- Shows the **top 50**. A player outside the top 50 sees their own row pinned at the bottom with their rank.
- Each row: rank, name, win rate, wins, games. Nothing else about a player is shown: no email, no game list, no picture.
- **Who can see it:** signed-in players with at least one counted game. Someone who finds the site and signs in can't see it until they've played. Guests see "Sign in to see the leaderboard."
- All time only.

### Hiding from the leaderboard

- **Show me on the leaderboard** (Account page) is **on** by default. Off removes the player at once; they still see the leaderboard and their own stats, with "You're hidden from the leaderboard" where their row would be.
- Deleting an account removes the player from the leaderboard and deletes their stats ([accounts](../accounts/feature-brief.md#deleting-an-account)).

### Names

- The leaderboard uses the account's name, not the names used in individual games ([accounts](../accounts/feature-brief.md#names)). Renaming updates the leaderboard at once.
- Names aren't unique. The player's own row is highlighted so they can find themselves.
- The admin can rename or hide a player in the database. No in-app reporting.

## Decisions (2026-11-10)

**Everyone on Schmegettes** (owner's choice):

| Option | For | Against |
|---|---|---|
| People you've played with | Only shows names you've already seen on a scoreboard | Small groups make a thin leaderboard |
| Per room group | A leaderboard for each regular group | Needs a new idea, a lasting group, because rooms close after each session |
| **Everyone (chosen)** | One leaderboard, simple to understand | Shows names to people who've never played together. Limited by: accounts only, 10-game minimum, viewers must have played, names only, opt-out |

**Ranking metric** (product default, to confirm):

| Option | For | Against |
|---|---|---|
| **Win rate, 10-game minimum (chosen)** | Rewards winning, not just playing a lot | A win against one opponent counts the same as a win against five |
| Total wins | Easy to understand | The most frequent player always leads |
| Average score | Rewards strong play even without wins | Boards and opponents differ a lot between games |

**Stats shown** (owner's choice): games and wins, scores, and accuracy. Category strengths were left out because categories rarely repeat.

## Out of scope

- Weekly or monthly leaderboards, and leaderboards for a group or room
- Other rankings (by score, accuracy) or sorting the leaderboard
- Other players' stats pages
- Category strengths, buzz speed, streaks, badges
- Stats or leaderboard on the TV
- Guests' stats
- In-app reporting of names
