# Product Overview

**Schmegettes** is a multiplayer Jeopardy!-style party game played in the browser, modeled on the Weekend Games version (weekend.com/games/jeopardy). Friends join a room with a short code from their own phones or laptops, then select clues, race to buzz in, and answer by typing or speaking.

> Status: this overview reflects the earlier prototype (`wygarner/Schmegettes`) and the bootstrap decisions. `/product` owns it and should refine it before the first feature brief.

## Core model

| Concept | Meaning |
|---|---|
| **Room** | A lobby with a 5-character code. One host, up to 6 contestants (configurable 2–8), any number of spectators. |
| **Host** | Creates the room, starts the game, can override any verdict. Plays as a contestant too unless they choose host-only. |
| **Board** | 6 categories × 5 clues per round, drawn from the clue catalog (past seasons). Single and Double rounds, then Final. |
| **Control** | The player who last answered correctly picks the next clue. |
| **Buzzing** | Opens after the clue is read. Buzzing early earns a short lockout. First valid buzz answers. |
| **Answer** | Typed or spoken. Judged instantly; wrong answers subtract the clue's value and reopen buzzing for the others. |
| **Daily Double / Final** | Wagered clues. Final: everyone with a positive score wagers secretly, answers privately, reveal in score order. |

## Game phases

`lobby → board → clue_reading → buzzing_open → answering → board …` with `daily_double_wager` for Daily Doubles and `final_category → final_wager → final_answer → final_reveal → finished` at the end. These names are the contract in `shared/schemas/domain.schema.json`.

## Principles

- **No account required to play.** Players start anonymous and can link an account later to keep history.
- **Fair buzzing.** The server decides who buzzed first; latency is measured, not trusted.
- **Generous judging.** Small typos and missing "What is" don't cost points; the host can always override.
- **Correct responses stay secret** until a clue is judged.

## Carry-overs from the prototype

Voice selection of categories ("I'll take Science for 400") and spoken answers, fuzzy answer matching, and season/air-date selection of boards from the `jeopardy_clue_dataset`.
