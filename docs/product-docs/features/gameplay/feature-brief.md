# Gameplay: The Core Loop

## Why

After Start, the room needs to play. A player picks a clue, the TV reads it out, everyone races to buzz, the fastest player says the response out loud, and the game judges it on the spot. That loop, repeated over the Single and Double Jeopardy boards, is the game. Everything else (wagers, Final Jeopardy, overrides, rematch) builds on it.

This is feature 1 of 3. Feature 2 adds Daily Doubles and Final Jeopardy. Feature 3 adds host overrides and the end-of-game scoreboard and rematch.

## Jobs to be done

| Who | Job |
|---|---|
| Contestant | "When I have control, I pick a clue from my phone." |
| Contestant | "I hear the clue, and the moment it's read I can buzz. If I'm first, I say my answer out loud and find out right away whether I got it." |
| Contestant | "The race is fair: the fastest buzz wins, wherever I'm sitting and whatever phone I have." |
| Host (TV) | "The TV runs the show by itself. It reads clues, shows who's answering, and keeps score, so I don't have to." |
| Host who plays | "I play on the host device like everyone else does on their phone (lobby feature, player bar)." |
| Everyone in the room | "I can follow along on the TV: the board, the clue, who buzzed, what they said, and the scores." |

## Rules

### The board and control

- Two rounds: **Single** (values 200–1,000) and **Double** (400–2,000). Each has 6 categories × 5 clues, built at Start ([game history](../game-history/feature-brief.md)).
- **Control** decides who picks. At the start of the game a random contestant has control. After that, whoever last answered correctly has it. When nobody answers correctly, control stays where it was.
- Double Jeopardy starts with the contestant who has the **lowest score**. A tie goes to whoever comes first in join order.
- The player in control picks by **tapping** the clue on their phone. The phone shows the board as category names and values, never clue text.
- **The host device can always pick** by tapping the board on the TV. That covers a controller who is away, slow, or disconnected.
- If nobody picks within **15 s**, the TV shows "Waiting for Alice to pick…" with a hint that the host can pick. The game never picks for anyone.

### Reading and buzzing

- The TV shows the clue full screen and **reads it aloud** with the host device's text-to-speech.
- Buzzing opens when the reading ends. The host device reports the end of speech. If speech fails or stalls, the server opens buzzing anyway after an estimate from the clue's length (about 2.5 words per second plus 1 s, at most 12 s).
- **Early buzz:** a buzz before buzzing opens locks that player out for **250 ms**, as on the show. The buzz is not queued.
- **First valid buzz wins.** The order is the order the server receives buzzes. Phone clocks are never trusted.
- **Buzz window: 5 s.** If nobody buzzes, the clue goes unanswered and the TV shows the correct response for 3 s. Control doesn't change.
- Every phone shows the buzzer state at the same moment: **dim** while the clue is read, **lit** when buzzing opens, **locked** after an early buzz or once that player has answered this clue.

### Answering and judging

- The winning player's phone (or the host device's player bar) **starts listening on its own**. The player speaks their answer, with no button to hold. It stops when the player goes quiet or after **7 s**.
- "What is…" is optional. Judging is generous: small mishearings and transcription slips don't cost points ([product overview](../../architecture/product-overview.md), Principles).
- **Correct:** the player gains the clue's value and takes control. The TV shows the correct response, and the clue is done.
- **Incorrect:** the player loses the clue's value. Buzzing **reopens** for players who haven't tried this clue, with a fresh 5 s window. Each player gets one attempt per clue.
- **No answer heard** within 7 s counts as incorrect, as on the show, with one exception for disconnects (Fairness below).
- A clue ends when someone answers correctly, everyone has tried, or a buzz window closes with no buzz. Then the TV shows the correct response for 3 s and returns to the board.
- **Daily Doubles:** feature 2 adds wagering. Until then, a Daily Double square plays like any other clue.

### Rounds and the end

- When every clue on the Single board is done, the TV shows "Double Jeopardy!" for 3 s, then the Double board.
- When the Double board is done, the game ends. Until feature 2 adds Final Jeopardy, the TV shows the **final scores** (highest first) and the game is recorded as finished. Feature 3 replaces this screen with the full scoreboard and **Rematch**.

### Scores

- Scores are shown on the TV at all times and can go negative. Each phone shows its own score.
- Every judged answer is recorded as it happens. Revealing a clue's text marks it as seen ([game history](../game-history/feature-brief.md)).

### Fairness and disconnects

| Situation | Rule |
|---|---|
| Two buzzes within milliseconds | The first one the server receives wins. There are no ties. |
| A player buzzes and their phone disconnects before answering | No penalty. Buzzing reopens for the others, and the disconnected player may not try this clue again. |
| A connected player says nothing for 7 s | Incorrect: they lose the value, as on the show |
| The player in control disconnects | They keep control. The host device can pick for them. |
| A player disconnects mid-game | Their score is kept. They can reconnect and keep playing. The server never closes a game because of a phone. |
| The host device disconnects | The game **pauses**: no timers run and buzzers go dim. It resumes when the host device reconnects. After 30 minutes with no host device, the game is abandoned ([game history](../game-history/feature-brief.md)). |
| The correct response | Never reaches a phone. The TV gets it only once the clue is judged or ends. |
| The host plays | Same rules. The host device shows clue text, as the TV always does, and never shows a correct response early. |

## Out of scope

- Daily Double and Final Jeopardy wagers (feature 2)
- Host overrides of a verdict, the end-of-game scoreboard, and Rematch (feature 3)
- Picking a clue by voice ("Science for 400"). It comes later; tap only for now.
- An LLM appeal of a verdict
- Typed answers (never: answers are spoken)
- Sound effects and music
