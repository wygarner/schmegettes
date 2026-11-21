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

- Two rounds: **Single** (values 200–800) and **Double** (400–1,600). Each has **5 categories** × **4 clues**: the board fills the stage's width, so headers and values stay readable on the host's iPhone. Built at Start ([game history](../game-history/feature-brief.md)).
- **Control** decides who picks. At the start of the game a random contestant has control. After that, whoever last answered correctly has it. When nobody answers correctly, control stays where it was.
- Double Schmegettes starts with the contestant who has the **lowest score**. A tie goes to whoever comes first in join order.
- The player in control picks on their phone, by **tapping** the clue or by **saying it**: they press their **buzzer** and say "Science for 400". On the board, the controller's buzzer is their microphone button; there is no separate one. The phone shows the board as category names and values, never clue text. A voice pick matches the category even with small slips ("sciense") and accepts "$400", "four hundred", or just the category when one clue is left in it. With the **default spoken clue value** set to **Lowest left** ([game options](../lobby/feature-brief.md#game-options); called Quick picks until task `lobby-qa-polish` ships), just the category always works: it picks the **lowest value left** in that category (a Daily Double included, if that's where it is). An amount that was heard always wins: "Opera for 600" with 600 done is "That one's already been played.", never the lowest. When it can't tell, it says what it missed, and the player can try again or tap.
- **A tapped pick asks for confirmation** ("Volcanoes for $400?" **Pick** / **Cancel**), because a mis-tap on a small board is easy. A spoken pick does not: saying it is already deliberate.
- **Only the player in control can pick.** The board on the TV is tappable only when the host joined the game and has control; otherwise taps on the TV do nothing. The server enforces this.
- **Controller gone:** if the player in control is disconnected while the board is up, control passes after **10 s** to the next connected contestant in join order. If they reconnect first, they keep it. The game never picks a clue for anyone.
- The TV shows who is picking by highlighting that player's tile in the score column. There is no "Waiting for … to pick" text and no host-pick hint.

### Reading and buzzing

- **The pick reveal (2.25 s).** When a clue is picked, its cell **blinks** on the TV board (three quick flashes, 0.6 s), then **lifts out of the board and grows into a card** in the middle of the stage showing the category and the value ("VOLCANOES", "$400"), 0.6 s, and **holds** there for 1.05 s so the room can read it. The card then becomes the clue screen. Nothing is spoken during the reveal, and it never waits on the narrator or the network: it always takes 2.25 s.
- The TV then shows the clue full screen and **reads it aloud** in the narrator's voice. There is no spoken announcement ("Here's Volcanoes for 400." is gone): the reveal shows the pick, and the narrator reads only the clue.
- Buzzing opens when the reading ends. The host device reports the end of speech. If speech fails or stalls, the server opens buzzing anyway after the 2.25 s reveal plus an estimate from the clue's length (about 2.5 words per second plus 1 s, at most 14 s).
- The buzzer is **dim from the moment of the pick**: a buzz during the reveal is an early buzz, like one during the reading.
- A **Daily Double** blinks the same way, then shows the Daily Double reveal instead of the card ([wagers](../wagers/feature-brief.md#daily-doubles)).

- **Early buzz:** a buzz before buzzing opens locks that player out for **250 ms**, as on the show. The buzz is not queued.
- **First valid buzz wins.** The order is the order the server receives buzzes. Phone clocks are never trusted.
- **Buzz window: 9 s**, the same in every game. If nobody buzzes, the clue goes unanswered and the TV shows the correct response. Control doesn't change.
- **The buzzer is always on screen** for every contestant, from the moment they join the lobby to the end of the game. The host device is the exception: a playing host's buzzer appears at Start ([lobby](../lobby/feature-brief.md#the-host-who-also-plays)). Every view (phone, and the host device when the host plays) uses the same buzzer component. Its state changes at the same moment everywhere: **dim** when buzzing is closed or the clue is being read, **lit** when buzzing opens, **locked** after an early buzz or once that player has answered this clue. A tap on a dim buzzer outside `clue_reading` does nothing and costs nothing, except for the player in control on the board, whose buzzer starts listening for their pick.

### The narrator's voice

- **Only the Schmegettes voices.** The narrator is always one of the game's own voices: free, open-source voices (Piper) that the host device generates itself. They sound the same on every host device, cost nothing, and need no server. **The device's built-in voices are never used**, not even as a fallback. Phones never speak and never download them.

  | Voice | Sounds | License |
  |---|---|---|
  | **Norman** (default) | US English, male | Public domain |
  | **Kristin** | US English, female | Public domain |
  | **John** | US English, male | Public domain |

- **Downloaded before the game, one kept.** Each voice is about **63 MB**. Norman starts downloading in the background as soon as the host lobby opens; Kristin or John downloads when the host picks it. The browser keeps the voice in use for next time, and only that one: when the host switches, the old voice is removed once the new one is ready.
- **Start waits for the voice.** Until the picked voice is ready on the host device, **Start** is disabled and shows the progress ([lobby](../lobby/feature-brief.md#the-lobby-host-device--tv)). A failed download says so, with **Try again**. Once a voice has downloaded, later games start at once.
- **A device that can't run the voices can't host.** The lobby says "This device can't run the Schmegettes narrator. Host from a recent iPhone, iPad or computer." and Start stays disabled.
- **Reading starts quickly.** The narrator prepares the clue during the 2.25 s pick reveal, so the first word is heard within **1 s** of the clue appearing on the TV.
- **A line that isn't ready in time** (not started **1.5 s** after it should have, or an error) is **skipped**: the text stays on screen and the game goes on (for a clue, buzzing opens on the server's estimate). The next line tries the voice again. No other voice stands in.
- **Plays through the silent switch.** On an iPhone or iPad, the narrator is heard with the ring/silent switch on, at media volume, like a video. The volume buttons control it.
- **It never slows the host's buzzer.** Generating speech must not make the host device's screen or buzzer lag: a host who plays buzzes as quickly as anyone.
- The host can **change the voice in the lobby** and hear a sample first ([lobby](../lobby/feature-brief.md#the-lobby-host-device--tv)). The same voice speaks every line: clues, Daily Double and Final lines, and the correct response.
- The choice is **kept on that host device** for every room it hosts until the host changes it. It isn't tied to the host's account and never reaches the server. A device where the host never picked a voice gets Norman, including one that has been using Kristin only because she was the default before; it downloads Norman once (Start waits, as for any new voice). A device where the host picked Kristin or John keeps it. A device that had picked a built-in voice before gets Norman, without a message.
- **Every voice speaks at its normal pace, and buzzing never opens before the reading ends.** There's no speed setting. The server's fallback estimate starts when the clue is picked, so the reveal and the time spent generating speech count against it.

### Answering and judging

- The winning player's phone (or the host device, when the host buzzed) **starts listening on its own**. The player speaks their answer, with no button to hold. It stops when the player goes quiet or after **9 s**.
- "What is…" is optional. Judging is generous: small mishearings and transcription slips don't cost points ([product overview](../../architecture/product-overview.md), Principles).
- **Correct:** the player gains the clue's value and takes control. The TV shows the correct response, and the clue is done.
- **Answer time: 9 s**, the same in every game.
- **Incorrect:** the player loses the clue's value. Buzzing **reopens** for players who haven't tried this clue, with a fresh 9 s window. Each player gets one attempt per clue.
- **No answer heard** within 9 s counts as incorrect, as on the show, with one exception for disconnects (Fairness below).
- A clue ends when someone answers correctly, everyone has tried, or a buzz window closes with no buzz. Then the TV shows the correct response: a short sound plays ([sound effects](../sound-effects/feature-brief.md)), the narrator says the line ("Correct, Mauna Loa is the right answer." / "Sorry, we were looking for Mauna Loa."), and **1 s after the line ends** the TV returns to the board. If the host device never reports the end of the line, the board returns **6 s** after the clue ended at the latest. The correct-response screen does not show the clue text.
- **Daily Doubles:** the player who picks one wagers and answers alone, with no buzzing ([wagers](../wagers/feature-brief.md)).

### How an answer is matched

Both sides are lowercased, and punctuation, parenthetical hints ("(Abraham) Lincoln"), question phrasing ("what is", "who are") and articles are dropped. Accents are ignored, St/Mt/Dr mean Saint/Mount/Doctor, and numbers said as words count as digits.

- **Exact:** the two are then the same.
- **Spelling slip:** the answer is off by at most one letter per five letters of the response ("Parris" for Paris), and starts with the same letter ("russia" isn't Prussia).
- **Sounds alike:** speech-to-text often writes a right answer the way it sounds, so an answer that **sounds like** the whole correct response is correct, however it's spelled or split into words.

| Heard as | Correct response | Verdict |
|---|---|---|
| "mona lowa" | Mauna Loa | ✓ sounds the same |
| "linkin" | Lincoln | ✓ sounds the same |
| "sane" | Seine | ✓ sounds the same |
| "neechee" | Nietzsche | ✓ sounds the same |
| "war of eighteen twelve" | War of 1812 | ✓ numbers said as words |
| "dvorak" | Dvořák | ✓ accents don't matter |
| "st louis" | Saint Louis | ✓ St/Saint, Mt/Mount, Dr/Doctor |
| "austria" | Australia | ✗ a different word |
| "russia" | Prussia | ✗ a different word |
| "kilauea" | Mauna Loa | ✗ a different answer |
| "eighteen twenty one" | 1812 | ✗ numbers must be the same number |
| "soos" | Zeus | ✗ short responses keep the spelling rule |

- **The whole response, in order.** Sounding like part of it, or like a different word that shares some sounds, is wrong.
- **Short one-word responses** (4 letters or fewer: Zeus, Oslo, Ra) keep the spelling rule above, because short words sound like too many others.
- **Several hearings.** When the phone's speech recognition offers more than one possible transcript, the answer is correct if any of them matches. The TV shows the one that matched, or the most likely one when none did.
- **Final Schmegettes** uses the same rules for typed answers, so a phonetic spelling of the right answer counts.
- Judging stays instant and on the server. The host can still override any verdict ([overrides](../scoreboard-and-overrides/feature-brief.md)).
- **Why it was judged that way is recorded.** Every judged answer keeps which rule decided it (**exact**, **spelling slip**, **sounds alike**, **no match**, or **nothing heard**) and every transcript the phone heard. No screen shows this. Together with host overrides ([overrides](../scoreboard-and-overrides/feature-brief.md#host-overrides)), it shows where the judge is too strict or too generous so the rules can be tuned.

### Rounds and the end

- When every clue on the Single board is done, the TV shows "Double Schmegettes!" for 3 s, with its sound ([sound effects](../sound-effects/feature-brief.md)), then the Double board.
- The host can turn **Double Schmegettes off** in the lobby ([game options](../lobby/feature-brief.md#game-options)). Then Final Schmegettes follows the Single board, and the game has one board.
- When the last board is done, **Final Schmegettes** follows ([wagers](../wagers/feature-brief.md)). Then the TV shows the **final scores** (highest first) and the game is recorded as finished. Feature 3 replaces this screen with the full scoreboard and **Rematch**.

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
| A connected player says nothing for 9 s | Incorrect: they lose the value, as on the show |
| The player in control disconnects | While the board is up, control passes after 10 s to the next connected contestant in join order. If they reconnect within 10 s, they keep it. Control lost this way isn't given back. |
| A connected player in control never picks | The game waits. Nobody else can pick, the host device included. |
| A player disconnects mid-game | Their score is kept. They can reconnect and keep playing: reloading, or **Rejoin** on Home after closing the tab ([rejoin and resume](../rejoin-games/feature-brief.md)). The server never closes a game because of a phone. |
| The host device disconnects | The game **pauses**: no timers run and buzzers go dim. It resumes when the host device reconnects. After 30 minutes with no host device, the game is abandoned ([game history](../game-history/feature-brief.md)); its host can **resume** it later ([rejoin and resume](../rejoin-games/feature-brief.md)). |
| The correct response | Never reaches a phone. The TV gets it only once the clue is judged or ends. |
| The host plays | Same rules. The host device shows clue text, as the TV always does, and never shows a correct response early. |

## Out of scope

- Daily Double and Final Schmegettes wagers ([wagers](../wagers/feature-brief.md), feature 2)
- Host overrides of a verdict, the end-of-game scoreboard, and Rematch (feature 3)
- An LLM appeal of a verdict
- Typed answers for regular clues (they're spoken. Only Final Schmegettes is typed: [wagers](../wagers/feature-brief.md))
- Music. Sound effects are their own feature: [sound effects](../sound-effects/feature-brief.md)
