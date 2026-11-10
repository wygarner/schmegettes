# Stats and Leaderboard: Interaction Design

## Where it lives

- Home gets a **Stats** link next to **My games**.
- `/stats` has two tabs: **You** (`/stats`) and **Leaderboard** (`/stats/leaderboard`).
- Phones only. Nothing about stats appears in a room or on the TV.

## You

```text
┌────────────────────────────────────────┐
│ ‹ Home          Stats                  │
│ [ You ]  Leaderboard                   │
│                                        │
│ GAMES                                  │
│   42 games    17 wins    40% win rate  │
│                                        │
│ SCORES                                 │
│   Average   $6,850                     │
│   Best      $21,400 ›                  │
│   Career    $287,700                   │
│                                        │
│ ACCURACY                               │
│   Correct answers   62% · 124 of 200   │
│   Daily Doubles     5–2                │
│   Final Schmegettes 18–14              │
│                                        │
│ Leaderboard rank: 12th                 │
└────────────────────────────────────────┘
```

- Numbers use the scoreboard's number style (Oswald). Negative dollar amounts show as "−$400", like scoreboards.
- **Best** opens that game's scoreboard (`/games/{id}`).
- The last line is "Leaderboard rank: 12th", "Play 7 more games to get on the leaderboard.", or "You're hidden from the leaderboard." (linking to Account).
- No counted games: "Play a game to see your stats." and **Join a game**.

## Leaderboard

```text
┌────────────────────────────────────────┐
│ ‹ Home          Stats                  │
│   You  [ Leaderboard ]                 │
│                                        │
│  #  Name          Win%   Wins   Games  │
│  1  Carol          58%     29      50  │
│  2  Bob            51%     21      41  │
│  2  Eun-ji         51%     21      41  │
│  4  Alice          47%     33      70  │
│  …                                     │
│ 50  Gus            19%      2      11  │
│ ────────────────────────────────────── │
│ 63  Wyatt (you)    15%      3      20  │
│                                        │
│ Win rate across finished games.        │
│ 10 games to qualify.                   │
└────────────────────────────────────────┘
```

- Top 50, one row per player. My row is highlighted and says "(you)". If I'm outside the top 50, my row is pinned below a divider.
- 1st, 2nd and 3rd ranks use the gold, silver and bronze from My games' placement badges.
- Rows aren't tappable (no other players' stats).
- Fewer than 10 players qualify: show who does, plus "More players appear after 10 games."
- Nobody qualifies yet: "Nobody's played 10 games yet. Keep playing."

## Guests and new accounts

| Who | You tab | Leaderboard tab |
|---|---|---|
| Guest | "Sign in to see your stats and the leaderboard." **Sign in** ([accounts](../accounts/interaction-design.md)) | Same |
| Signed in, no counted games | "Play a game to see your stats." | "Play a game to see the leaderboard." |
| Signed in, 1–9 counted games | Stats | Leaderboard, my row not shown, "Play 7 more games to get on the leaderboard." at the bottom |
| Signed in, hidden | Stats | Leaderboard without me, "You're hidden from the leaderboard." at the bottom |

## Account page

**Show me on the leaderboard** switch ([accounts](../accounts/interaction-design.md#account-page-account)), on by default, saves at once. Turning it off: toast "You're hidden from the leaderboard." Turning it on: toast "You're on the leaderboard." (or "You'll appear after 10 games.").

## Edge cases

| Situation | Behavior |
|---|---|
| A game just finished | Stats and leaderboard include it within a minute. |
| A game ends abandoned | Not counted. Still in My games with "Unfinished". |
| Shared 1st place | A win for each player sharing it |
| Player left mid-game | Counted with their score and placement on that scoreboard |
| Guest games moved in at sign-in | Counted from then on; stats update within a minute |
| Same person in one game as guest and account | Only the account's row counts (the guest's row is "Former player") |
| Answer under appeal | Not counted until decided |
| Player renames | Leaderboard shows the new name at once; old scoreboards keep old names |
| Player deletes account | Gone from the leaderboard; ranks below move up |
| Two players with the same name | Both listed; only my row says "(you)" |
| Stats can't load | "Couldn't load stats. Try again." with **Retry** |
