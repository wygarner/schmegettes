# Gameplay: The Core Loop

## Why

After Start, the room needs to play. A player picks a clue, the TV reads it out, everyone races to buzz, the fastest player says the response out loud, and the game judges it on the spot. That loop, repeated over the Single and Double Schmegettes boards, is the game. Everything else (wagers, Final Schmegettes, overrides, rematch) builds on it.

This is feature 1 of 3. Feature 2 adds Daily Doubles and Final Schmegettes. Feature 3 adds host overrides and the end-of-game scoreboard and rematch.

## Jobs to be done

| Who | Job |
|---|---|
| Contestant | "When I have control, I pick a clue from my phone." |
| Contestant | "I hear the clue, and the moment it's read I can buzz. If I'm first, I say my answer out loud and find out right away whether I got it." |
| Contestant | "The race is fair: the fastest buzz wins, wherever I'm sitting and whatever phone I have." |
| Host (TV) | "The TV runs the show by itself. It reads clues, shows who's answering, and keeps score, so I don't have to." |
| Host who plays | "I play on the host device like everyone else does on their phone (lobby feature, player column)." |
| Everyone in the room | "I can follow along on the TV: the board, the clue, who buzzed, what they said, and the scores." |

## Rules

### The board and control

- Two rounds: **Single** (values 200–800) and **Double** (400–1,600). Each has 6 categories × **4 clues**, so the board stays readable on the host's iPhone. Built at Start ([game history](../game-history/feature-brief.md)).
- **Control** decides who picks. At the start of the game a random contestant has control. After that, whoever last answered correctly has it. When nobody answers correctly, control stays where it was.
- Double Schmegettes starts with the contestant who has the **lowest score**. A tie goes to whoever comes first in join order.
- The player in control picks on their phone, by **tapping** the clue or by **saying it**: they tap 🎤 and say "Science for 400". The phone shows the board as category names and values, never clue text. A voice pick matches the category even with small slips ("sciense") and accepts "$400", "four hundred", or just the category when one clue is left in it. When it can't tell, it says what it missed, and the player can try again or tap.
- **A tapped pick asks for confirmation** ("Volcanoes for $400?" **Pick** / **Cancel**), because a mis-tap on a small board is easy. A spoken pick does not: saying it is already deliberate.
- **Only the player in control can pick.** The board on the TV is tappable only when the host joined the game and has control; otherwise taps on the TV do nothing. The server enforces this.
- **Controller gone:** if the player in control is disconnected while the board is up, control passes after **10 s** to the next connected contestant in join order. If they reconnect first, they keep it. The game never picks a clue for anyone.
- The TV shows who is picking by highlighting that player's tile in the score column. There is no "Waiting for … to pick" text and no host-pick hint.

### Reading and buzzing

- The TV shows the clue full screen and **reads it aloud** with the host device's text-to-speech. The narrator first announces the pick, "Here's Volcanoes for 400.", then reads the clue. The value is spoken as a number ("for 400", not "for four hundred dollars").
- Buzzing opens when the reading (announcement and clue) ends. The host device reports the end of speech. If speech fails or stalls, the server opens buzzing anyway after an estimate from the length of the announcement and clue together (about 2.5 words per second plus 1 s, at most 14 s).
- **Early buzz:** a buzz before buzzing opens locks that player out for **250 ms**, as on the show. The buzz is not queued.
- **First valid buzz wins.** The order is the order the server receives buzzes. Phone clocks are never trusted.
- **Buzz window: 5 s.** If nobody buzzes, the clue goes unanswered and the TV shows the correct response for 6 s. Control doesn't change.
- **The buzzer is always on screen** for every contestant, from the moment they join the lobby to the end of the game. Every view (phone, and the host device when the host plays) uses the same buzzer component. Its state changes at the same moment everywhere: **dim** when buzzing is closed or the clue is being read, **lit** when buzzing opens, **locked** after an early buzz or once that player has answered this clue. A tap on a dim buzzer outside `clue_reading` does nothing and costs nothing.

### Answering and judging

- The winning player's phone (or the host device, when the host buzzed) **starts listening on its own**. The player speaks their answer, with no button to hold. It stops when the player goes quiet or after **14 s**.
- "What is…" is optional. Judging is generous: small mishearings and transcription slips don't cost points ([product overview](../../architecture/product-overview.md), Principles).
- **Correct:** the player gains the clue's value and takes control. The TV shows the correct response, and the clue is done.
- **Incorrect:** the player loses the clue's value. Buzzing **reopens** for players who haven't tried this clue, with a fresh 5 s window. Each player gets one attempt per clue.
- **No answer heard** within 14 s counts as incorrect, as on the show, with one exception for disconnects (Fairness below).
- A clue ends when someone answers correctly, everyone has tried, or a buzz window closes with no buzz. Then the TV shows the correct response for **6 s** and returns to the board. The correct-response screen does not show the clue text.
- **Daily Doubles:** the player who picks one wagers and answers alone, with no buzzing ([wagers](../wagers/feature-brief.md)).

### Rounds and the end

- When every clue on the Single board is done, the TV shows "Double Schmegettes!" for 3 s, then the Double board.
- When the Double board is done, **Final Schmegettes** follows ([wagers](../wagers/feature-brief.md)). Then the TV shows the **final scores** (highest first) and the game is recorded as finished. Feature 3 replaces this screen with the full scoreboard and **Rematch**.

### Scores

- Every contestant's **name and score** are on the TV at all times, on every screen of the game (board, clue, answering, correct response, "Double Schmegettes!", paused). Scores can go negative. Each phone shows its own score.

### The host device's screen

- The host device is an **iPhone in landscape**, mirrored to the TV. Every host screen (lobby and game) is laid out for that viewport first, fits without scrolling, and respects the notch's safe areas. A larger screen (laptop, iPad) gets the same layout, scaled up.
- Every judged answer is recorded as it happens. Revealing a clue's text marks it as seen ([game history](../game-history/feature-brief.md)).

### Fairness and disconnects

| Situation | Rule |
|---|---|
| Two buzzes within milliseconds | The first one the server receives wins. There are no ties. |
| A player buzzes and their phone disconnects before answering | No penalty. Buzzing reopens for the others, and the disconnected player may not try this clue again. |
| A connected player says nothing for 14 s | Incorrect: they lose the value, as on the show |
| The player in control disconnects | While the board is up, control passes after 10 s to the next connected contestant in join order. If they reconnect within 10 s, they keep it. Control lost this way isn't given back. |
| A connected player in control never picks | The game waits. Nobody else can pick, the host device included. |
| A player disconnects mid-game | Their score is kept. They can reconnect and keep playing. The server never closes a game because of a phone. |
| The host device disconnects | The game **pauses**: no timers run and buzzers go dim. It resumes when the host device reconnects. After 30 minutes with no host device, the game is abandoned ([game history](../game-history/feature-brief.md)). |
| The correct response | Never reaches a phone. The TV gets it only once the clue is judged or ends. |
| The host plays | Same rules. The host device shows clue text, as the TV always does, and never shows a correct response early. |

## Out of scope

- Daily Double and Final Schmegettes wagers ([wagers](../wagers/feature-brief.md), feature 2)
- Host overrides of a verdict, the end-of-game scoreboard, and Rematch (feature 3)
- An LLM appeal of a verdict
- Typed answers for regular clues (they're spoken. Only Final Schmegettes is typed: [wagers](../wagers/feature-brief.md))
- Sound effects and music
