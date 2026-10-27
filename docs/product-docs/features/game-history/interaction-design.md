# Game History and Fresh Boards: Interaction Design

## States of a game

```text
lobby ──Start──▶ building_board ──ready──▶ board … final_reveal ──▶ finished
                      │                          │
                      └──fails──▶ lobby          └──room closed / all left──▶ abandoned
```

| State | What players see |
|---|---|
| `lobby` | Player list, host's **Start** button |
| `building_board` | "Shuffling a fresh board…" for everyone. Target under 3 s. Joining is closed from here. |
| `board` onward | Normal play (product-overview.md, "Game phases") |
| `finished` | Final scoreboard, **Rematch** (host) and **Leave** |
| `abandoned` | Nobody is in the room to see it; it appears in history with an "Unfinished" tag |

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

**My games** (from the home screen):

| Date | Placement | Score | Players |
|---|---|---|---|
| Oct 26, 8:14 PM | 1st | $12,400 | Alice, Bob, Carol |
| Oct 24, 9:02 PM | 2nd | $3,200 · Unfinished | Alice, Dave |

Newest first, 20 per page. Tapping a row opens the scoreboard.

**Game scoreboard**:

```text
Oct 26, 2026 · 8:14 PM · 41 min
1st  Alice      $12,400
2nd  Bob         $8,000
2nd  Carol       $8,000
4th  Former player  −$400
```

Names are as they were in that game. Spectators who watched can open it but aren't listed in the scoreboard.

## Edge cases

| Situation | Behavior |
|---|---|
| A player disconnects while a clue is revealed | It counts as seen for them. They were in the game. |
| A player joins after Start | Not allowed. Joining closes when the board starts building. Spectators can still join and their seen clues are recorded from then. |
| A contestant leaves mid-game | Their score so far stays in the game. Clues revealed after they left don't count as seen for them. |
| The host leaves mid-game | Unchanged by this feature. Game continues or is abandoned per the room rules. |
| Two players tie | Shared placement (both 2nd; next is 4th) |
| Host overrides a verdict after scoring | The answer's score changes, so the final score changes with it |
| Not enough fresh categories | Fill with longest-ago, least-seen categories. No message to players. |
| A deleted player's past games | Show as "Former player" with their score |
