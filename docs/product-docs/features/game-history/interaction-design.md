# Game History and Fresh Boards: Interaction Design

## States of a game

```text
lobby ──Start──▶ building_board ──ready──▶ board … final_reveal ──▶ finished
                      │                          │
                      └──fails──▶ lobby          └──room closed / all left──▶ abandoned
```

| State | What players see |
|---|---|
| `lobby` | TV: room code and player list, **Start** on the host device. Phones: "You're in" and their name. |
| `building_board` | "Shuffling a fresh board…" on the TV and phones. Target under 3 s. Joining is closed from here. |
| `board` onward | Normal play (product-overview.md, "Game phases") |
| `finished` | Final scoreboard on the TV, **Rematch** on the host device, **Leave** on phones ([scoreboard and overrides](../scoreboard-and-overrides/interaction-design.md#end-of-game-scoreboard)) |
| `abandoned` | Nobody is in the room to see it; it appears in history with an "Unfinished" tag. Its host can resume it ([rejoin and resume](../rejoin-games/interaction-design.md)) |

## Flows

### Start a game (host)

1. Host presses **Start** in the lobby.
2. Everyone sees "Shuffling a fresh board…".
3. The board appears for everyone at once. The player with control picks first.

If the board can't be built (server error), everyone returns to the lobby with "Couldn't build a board. Try again." The host presses Start again. Nothing is recorded as seen.

### Rematch (host)

1. On the final scoreboard the host presses **Rematch**.
2. Players still in the room return to the lobby. Others can join by code until Start.
3. Start builds a new fresh board, which avoids the clues from the game just played.

### Look back at past games (any player)

**My games** (a **My games** link on the Home screen; `/games`, a game at `/games/{id}`). Built in `web/src/pages/MyGames.tsx` and `GameScoreboard.tsx`, served by `GET /v1/games` and `GET /v1/games/{gameId}` (`api/internal/games`). Reference designs: [system/menus-and-type](../../../../devtools/src/designs/system/menus-and-type.tsx) (this list) and [results/scoreboard-and-history](../../../../devtools/src/designs/results/scoreboard-and-history.tsx) (the scoreboard).

```text
┌──────────────────────────────────────────┐
│ ‹ Home                                   │
│ MY GAMES                                 │
│ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│ │ GAMES 14 │ │ WINS   5 │ │ BEST $12k │  │
│ └──────────┘ └──────────┘ └───────────┘  │
│ NOVEMBER 2026                            │
│ ┌──────────────────────────────────────┐ │
│ │ [4th] Today · 8:14 PM        −$400 › │ │
│ │       Alice, Bob, You, Dev           │ │
│ │ [1st] Sat, Nov 14 · 9:02 PM $12,400 ›│ │
│ │       You, Bob, Carol, Former player │ │
│ │ [2nd] Sun, Nov 8 · 7:40 PM   $3,200 › │ │
│ │       [Unfinished] Alice, You        │ │
│ │ [ 👁 ] Mon, Nov 2 · 8:30 PM         › │ │
│ │       [Watched] Eun-ji, Farah, Gus   │ │
│ └──────────────────────────────────────┘ │
│ OCTOBER 2026                             │
│ …                                        │
│               Show more                  │
└──────────────────────────────────────────┘
```

- Above the list: three stats: **Games** (every game listed, played or watched), **Wins** (1st places in finished games, in the accent), **Best** (my highest score). They count all my games, not just the 20 loaded: `GET /v1/games` returns them as `stats` on the first page. Hidden for a player with no played games.
- **No filter.** Played and watched games are listed together. Watched games keep their eye tile and **Watched** chip, so they're still easy to tell apart, and a host who didn't play still reaches **Resume game** from them.
- Games are grouped by month under small uppercase labels, the rows of a month inside one card with hairline dividers.
- One row per game: a placement tile (deep mauve with the board bevel; the placement in the accent green with a soft glow for 1st, silver for 2nd, bronze for 3rd), the weekday, date and time ("Today" for today), on the second line an **Unfinished** chip when the game was abandoned, then the players with "You" in place of my name ("You" brighter, "Former player" in italics), and my score in tabular figures (red when negative).
- Games I only watched (as a non-playing host or a spectator) have an eye in the tile, a **Watched** chip before the players, and no score.
- Newest first, 20 at a time, then **Show more**. Tapping a row opens the scoreboard.
- Loading shows skeleton stats and rows. Error: "Couldn't load your games" with **Try again**.
- Empty: "No games yet. Games you play or watch show up here, with everyone's scores." and **Join a game**.
- Under the list, for a guest: an info box "These games live on this phone. Played without an account. Sign in to keep them on any phone." with **Sign in to keep them** ([accounts](../accounts/interaction-design.md)).

**Game scoreboard**:

```text
Oct 26, 2026 · 8:14 PM · 41 min
1st  Alice      $12,400
2nd  Bob         $8,000
2nd  Carol       $8,000
4th  Former player  −$400
```

Above the list: "‹ My games", then the date, start time and length, then "Hosted by {name}". My row is highlighted in gold with "(you)", 🏆 marks 1st (not on an unfinished game), "Former player" is in italics. An unfinished game shows "Unfinished: these are the scores when the room closed." A game I watched says "You watched this game."

Names are as they were in that game. A non-playing host and spectators can open it but aren't listed in the scoreboard.

## Edge cases

| Situation | Behavior |
|---|---|
| A player disconnects while a clue is revealed | It counts as seen for them. They were in the game. |
| A player joins after Start | Not allowed. Joining closes when the board starts building. Spectators can still join and their seen clues are recorded from then. |
| A contestant leaves mid-game | Their score so far stays in the game. Clues revealed after they left don't count as seen for them. |
| The host device disconnects mid-game | Unchanged by this feature. Game continues or is abandoned per the room rules. |
| Two players tie | Shared placement (both 2nd; next is 4th) |
| Host overrides a verdict after scoring | The answer's score changes, so the final score changes with it |
| Not enough fresh categories | Fill with longest-ago, least-seen categories. No message to players. |
| A deleted player's past games | Show as "Former player" with their score |
