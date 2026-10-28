---
jira-type: new-feature
jira-title: "Gameplay core loop: pick, read, buzz, answer by voice, judge"
---
**Task Type:** New Feature

**Problem:** After Start the room reaches "The board is ready" and stops. Nothing is playable. This task builds the core loop: pick a clue, the TV reads it, players buzz, the winner answers out loud, the answer is judged and scored, across the Single and Double rounds. It is feature 1 of 3. Feature 2 adds Daily Doubles and Final Jeopardy; feature 3 adds overrides, the scoreboard, and rematch.

Durable docs: `docs/product-docs/features/gameplay/feature-brief.md` and `interaction-design.md`.

**Outcomes:**

- A full two-round game can be played from Start to final scores with phones as buzzers and microphones
- Buzzing is fair: the server's receive order decides, early buzzes are locked out for 250 ms, and phone clocks never count
- Answers are spoken and judged within a second of the player finishing
- Every reveal and judged answer is recorded, so game history and fresh boards work

**Player flow:**

1. **Board (TV and phones):** a random contestant has control at the start. The controller taps a clue on their phone; the host device can always tap the board to pick. After 15 s with no pick, the TV hints that the host can pick.
2. **Reading:** the TV shows the clue and reads it with the host device's text-to-speech. Buzzers are dim. A buzz now gives a 250 ms lockout.
3. **Buzzing:** opens when the host device reports speech ended, or on a fallback timer (about 2.5 words/s + 1 s, at most 12 s). The window is 5 s. With no buzz, the clue ends unanswered.
4. **Answering:** the winner's phone (or the host's player bar) starts listening automatically and stops on silence or after 7 s. The transcript is judged by the existing fuzzy judge.
   - Correct: +value, and the player takes control.
   - Incorrect or silent: −value, and buzzing reopens for players who haven't tried (one attempt per clue).
5. **Clue ends:** the TV shows the correct response for 3 s and returns to the board.
6. **Rounds:** when Single is done, a 3 s "Double Jeopardy!" screen, then the Double board, with control going to the lowest score. When Double is done, the TV shows final scores and the game is recorded as finished (temporary until Final Jeopardy in feature 2).

**Rules and edge cases:**

- Daily Double squares play as normal clues until feature 2
- A phone that disconnects after winning a buzz: no penalty. Buzzing reopens, and that player is out for this clue.
- The host device disconnects: the game pauses (timers stop, buzzers dim) and resumes on reconnect. After 30 min the game is abandoned.
- The controller disconnects: they keep control, and the host device can pick
- Phones never receive clue text or correct responses; the TV gets the response only when the clue is judged or ends
- Microphone permission is requested in the lobby. A blocked microphone or a browser without speech recognition gets a clear message on the phone.
- Simultaneous picks by the controller and the host: the first one the server receives wins

**Success Criteria:**

- Two phones and a TV play a full Single + Double game to final scores without a reload
- With two phones buzzing at nearly the same time, the server's order decides, and both phones show the same winner
- A buzz during reading is locked out for 250 ms and doesn't win
- A spoken "what is nitrogen" for "Nitrogen" is judged correct; "oxygen" is judged incorrect, with −value and a reopen
- The TV shows the correct response; a phone never receives it (checked in tests on the outgoing messages)
- Reloading a phone mid-clue returns it to the right state, including a locked buzzer if it already tried
- Unplugging the host device pauses the game, and reconnecting resumes it
- `game_results` scores equal the scores shown on the TV at the end

**Out of scope:** Daily Double and Final wagers, host overrides, the end-of-game scoreboard and Rematch, voice picking ("Science for 400"), LLM appeals, typed answers, sound effects.
