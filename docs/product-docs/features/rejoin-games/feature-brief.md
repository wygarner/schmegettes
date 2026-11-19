# Rejoin and Resume Games

## Why

Two things end a game early today, and both lose it.

- **A player leaves the page.** Reloading puts them back in the game, but if they close the tab, go to Home, or their browser drops the page, nothing leads them back. The game is still going without them.
- **The game is abandoned.** When the host device is gone for 30 minutes, the game ends as Unfinished. A dead phone or an early night loses the whole board, scores and all.

## Jobs to be done

| Who | Job |
|---|---|
| Contestant | "I closed the tab by mistake. I open Schmegettes and get straight back into my game with my score." |
| Host | "My phone died mid-game. When I'm back, I get the TV straight back into the game." |
| Host | "We stopped halfway last night. Tonight I pick the game up where we left it: same board, same scores." |
| Contestant | "When the host resumes our game, I get my seat and my score back." |

## Rules

### Rejoin a game in progress

- **Home shows the game you're in.** Anyone who's part of a room that hasn't ended (in the lobby, or with a game in progress, paused included) sees a card at the top of Home: "**Game in progress** · Room K7RXM · Alice, Bob, You" with **Rejoin**. In a lobby it says "**You're in a lobby**".
- **Rejoin** takes a contestant back to their seat (`/join/{code}`) and the host back to the TV view (`/host/{code}`), exactly as a reload would: same player, same score, no name prompt.
- "Part of" means the same account: the same browser, or the same signed-in account on another device ([accounts](../accounts/feature-brief.md)). Rejoining from another device moves the player there; the old page shows "You're playing on another device." For the host, the existing rule stands: only the host's account can open the TV view.
- The card goes away when the game ends (finished or abandoned), or when the player pressed **Leave** in the lobby.
- One card at most. A player who is in more than one room that hasn't ended (rare: a lobby they never left plus a game) sees the game in progress.
- Nothing changes in the game itself: a player who's away is shown "(reconnecting)", keeps their score, and loses control on the board after 10 s, as today ([gameplay](../gameplay/feature-brief.md#fairness-and-disconnects)).

### Resume an abandoned game

- **Who:** only the game's **host**, from the game's page in **My games**, which shows **Resume game** on an **Unfinished** game they hosted.
- **When:** any time within **30 days** of the game being abandoned, as long as it's still Unfinished. After that, the game stays in history as Unfinished, without the button.
- **What comes back:** the same game. Same board with the same clues already done, same scores, same game options ([lobby](../lobby/feature-brief.md#game-options)), same narrator voice choice of the host device, same control. The game's record in history stays one game: it is in progress again and later ends **finished** or **abandoned** again.
- **A new room.** Resume opens a **resume lobby** with a new room code (the old room is closed). It lists the game's contestants with their scores, each dimmed as "not back yet" until they join.
- **Who can join:** only the game's own contestants, matched by account. Each enters the new code (or taps **Join** on the Home card, which shows "**Wyatt is resuming your game**" to every contestant of that game). Their seat and score come back. Nobody new can join a resumed game; a new player sees "This game is being resumed. Only its players can join."
- **Resume:** the host presses **Resume** once at least one contestant is back (the host counts if they played). The board appears, and the game carries on.
- **Contestants who don't come back** keep their seat and score, shown "(reconnecting)", and can join with the code later in the game. They're in Final if their score is above $0, as any disconnected contestant is ([wagers](../wagers/feature-brief.md#final-schmegettes)).
- **Where the game picks up:**

  | Abandoned during | Resumes at |
  |---|---|
  | The board | The board. Same player in control; if they're not back, control passes after 10 s as usual |
  | A clue (reading, buzzing, answering) | The board. That clue is done with no score change, as if nobody buzzed: its text was already seen |
  | A Daily Double | The board. The Daily Double is done with no score change |
  | The correct response | The board, or the next board (or Final) if it was the round's last clue |
  | "Double Schmegettes!" | The Double board |
  | Final (category, wager or answer) | The Final category again. Wagers and answers are entered again from scratch |
  | Final reveal | The reveal again from the first finalist. Wagers and answers are kept |

- **Seen clues** stay as they are: clues revealed before the game was abandoned are already seen, and the rest of the board is still unseen.
- A resumed game can be abandoned and resumed again.

### Stats and history

- A resumed game that finishes counts as **finished** in My games and in stats ([stats and leaderboard](../stats-and-leaderboard/feature-brief.md)), not Unfinished.
- Its date and time stay the original start; its length counts only time played.

## Out of scope

- Rejoining someone else's seat, or a new player taking an absent player's seat
- Resuming from another host than the game's host
- Resuming a game abandoned more than 30 days ago
- Resuming a game that was still in the lobby (it never started; it's not in history)
- Changing game options when resuming
