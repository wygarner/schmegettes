# Product Overview

**Schmegettes** is a multiplayer quiz-show party game played in the browser. It is played **together in one room**. The host's device, an iPhone held in landscape, shows the game on a TV (AirPlay or any screen mirroring). Everyone else joins with a short code on their phone, which becomes their buzzer and microphone: they pick clues, race to buzz in, and answer out loud (Final Schmegettes answers are typed, so nobody overhears them).

There is no remote play: a player has to see the TV to play.

> Status: this overview reflects the earlier prototype (`wygarner/Schmegettes`) and the bootstrap decisions. `/product` owns it and should refine it before the first feature brief.

## Core model

| Concept | Meaning |
|---|---|
| **Room** | A lobby with a 5-character code, shown on the TV. One host device, up to 6 contestants (configurable 2–6; 6 is the hard cap, so every score fits on the host's iPhone screen), any number of spectators. |
| **Host** | The device driving the TV. Creates the room, shows the board and clues, reads clues aloud, starts the game, and can override a verdict on the clue just played or a Final answer during its reveal ([scoreboard and overrides](../features/scoreboard-and-overrides/feature-brief.md)). In the lobby the host can **join the game**: the host device then is also that host's contestant, with a buzzer on screen and the device's microphone. Since the host device is mirrored to the TV, its buzzer is visible to the room; only the host's Final wager and Final answer are masked ([lobby](../features/lobby/feature-brief.md)). |
| **Contestant** | A player's phone (or the host device, when the host joins): buzzer and microphone, plus clue picking when they have control. A phone never shows clue text or responses; those are on the TV. |
| **Spectator** | A phone that joined to follow along without buzzing. Optional: people in the room can just watch the TV. |
| **Board** | 6 categories × 4 clues per round, drawn from the [clue catalog](../features/clue-catalog/feature-brief.md) (past seasons). Single and Double rounds, then Final. Built when the host presses Start, from categories nobody playing has seen ([game history](../features/game-history/feature-brief.md)). |
| **Control** | The contestant who last answered correctly picks the next clue, by voice (pressing their buzzer and saying "Science for 400") or by tapping on their phone (with a confirmation). Nobody else can pick for them, the host device included; a controller who disconnects loses control after 10 s ([gameplay](../features/gameplay/feature-brief.md)). |
| **Buzzing** | The TV shows the clue and reads it aloud (text-to-speech). Buzzing opens when the reading ends. Buzzing early earns a short lockout. First valid buzz answers. |
| **Answer** | Spoken into the buzzing player's phone. The one exception is Final Schmegettes, where answers are typed. Judged instantly; wrong answers subtract the clue's value and reopen buzzing for the others. |
| **Daily Double / Final** | Wagered clues. Wagers are entered on the phone. Final: every contestant with a positive score wagers secretly on their phone and types their answer on it; the TV reveals lowest score first ([wagers](../features/wagers/feature-brief.md)). |

## Game phases

`lobby → building_board → board → clue_reading → buzzing_open → answering → board …` with `daily_double_wager` for Daily Doubles and `final_category → final_wager → final_answer → final_reveal → finished` at the end. These names are the contract in `shared/schemas/domain.schema.json`.

## Principles

- **No account required to play.** Players start anonymous and can link an account later to keep history.
- **Fair buzzing.** The server decides who buzzed first; latency is measured, not trusted.
- **Generous judging.** Small mishearings, transcription slips, and a missing "What is" don't cost points; the host can always override.
- **Correct responses stay secret** until a clue is judged. Phones never receive clue text or responses.
- **Same room, one screen.** The TV is the shared view; phones are controllers.
- **Our own names.** The rounds are Single, **Double Schmegettes**, and **Final Schmegettes**. Schmegettes never names or imitates the TV quiz show it resembles (its name, logo, music, or catchphrases), in the product, code, or docs.

## Carry-overs from the prototype

Voice selection of categories ("I'll take Science for 400") and spoken answers, fuzzy answer matching, and season/air-date selection of boards from the clue dataset.
