# Game History and Fresh Boards

## Why

A quiz game is no fun when you already know the answer because you saw the clue last week. Every board a player gets should be made of clues nobody at the table has seen before. To do that, Schmegettes has to remember which clues each player has seen, and that record is also each player's game history: when they played, who they played with, and how everyone scored.

## Jobs to be done

| Who | Job |
|---|---|
| Contestant | "When I start a new game, I never get a clue I've already seen." |
| Host | "I can start a rematch in the same room and get a completely fresh board." |
| Contestant | "I can look back at my past games: when, who played, and the final scores." |
| Admin (us) | "I can see every game: when it was played, by whom, and the scores." |

## Rules

### What "seen" means

A clue is **seen** by everyone in the game at the moment its text is **revealed** to the room, whether or not they buzzed, and whether or not they were connected at that moment.

- Clues left unplayed on the board are **not** seen. A short game doesn't use up 40 clues.
- Daily Doubles count once revealed (the wagering player and everyone watching saw it).
- Final Schmegettes counts once the clue is revealed, for every player in the game, including those who couldn't wager.
- A non-playing host's and spectators' seen clues are recorded too, so if they play later they still get fresh clues. They do not constrain the board for the game they are watching.
- People in the room who watch the TV without joining on a phone aren't tracked; they may see repeats in a later game.

### Building a fresh board

- The board is built when the host presses **Start**, not when the room is created, because only then do we know who is playing.
- A board is made of **5 categories** per round. A category is one category from one aired game. A round uses its **first 4 clues** in aired order (the 5th, hardest, is left out), or its 1 clue for Final. A left-out clue is never revealed, so it is never seen. A category is **eligible** only if none of its clues has been seen by any contestant in this game. A host who joined the game is a contestant and counts; a host who only hosts does not.
- If there are not enough eligible categories to fill a board (rare: the catalog has hundreds of thousands of clues), fill the rest with the categories whose clues were seen **longest ago** by the fewest contestants. The game always starts; we never block play.
- A **rematch** in the same room builds a new board with the same rules. A room can hold many games.

### Game history

- A game is recorded when it **starts**, not only when it ends. Each revealed clue and each judged answer is recorded as it happens.
- A game ends as **finished** (Final revealed) or **abandoned** (the room closed or everyone left before the end). Abandoned games stay in history with the scores at that moment; their revealed clues still count as seen. The host can **resume** an abandoned game; it then ends finished or abandoned again ([rejoin and resume](../rejoin-games/feature-brief.md)).
- Each player's result keeps the **name they used in that game**, so later renames don't rewrite old scoreboards.
- A final score is always the sum of that player's scored answers. There is one source of truth.
- Placement: contestants only. Highest score is 1st. Tied scores share a placement (two players at 1st, the next is 3rd). A non-playing host and spectators have no placement.

### Who can see what

| Data | Who sees it |
|---|---|
| A game's date, players, scores, placements | Everyone who played or watched that game, permanently, even after leaving or the room closing |
| A player's list of past games (played or watched) | That player |
| Which clues a player has seen | Nobody in the UI. Used only to build boards. |
| Everything | Admin, in the database |

### Accounts and deletion

- Closing or deleting a room never deletes its games.
- When a player's account is deleted, their results stay on other players' scoreboards as **"Former player"**, and their seen-clue record is deleted.
- Anonymous players keep their history and seen clues as long as their anonymous account exists. Creating an account or signing in keeps both ([accounts](../accounts/feature-brief.md)). If they clear their browser before signing in, a new anonymous account starts with no history (and may see repeats); this is the expected tradeoff of no-account play.
- Any cleanup of old anonymous accounts follows the deletion rule above.

## Out of scope

- Matching boards to real aired episodes ("play the March 4, 1998 episode")
- Public or shareable results pages
- Stats and leaderboards across games: see [stats and leaderboard](../stats-and-leaderboard/feature-brief.md)
- Letting a player reset their seen clues
- Showing players how many clues they have seen
