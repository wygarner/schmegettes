# Sound Effects: Interaction Design

Rules: [feature brief](./feature-brief.md).

## When each sound plays

```text
clue ends ──▶ chime / time's-up (≤0.8 s) ──▶ narrator: "Correct, …" / "Sorry, …" ──▶ +1 s ──▶ board
                                                                    (at most 6 s after the clue ended)

pick DD ──▶ blink 0.6 s ──▶ "DAILY DOUBLE" + flourish (≤1.5 s) ──▶ "It's a Daily Double." ──▶ wager
                            └──────────────── 2 s reveal ────────────────┘

Single board done ──▶ "Double Schmegettes!" + fanfare (≤2.5 s) ──▶ Double board
                      └──────────────── 3 s ─────────────────┘

buzzer press (dim / lit / pick) ──▶ thunk on that device, at once

buzzing_open ──first valid buzz──▶ answering ──▶ buzz-in on the TV (≤0.4 s); answer time starts as usual
                                       └── wrong answer ──▶ buzzing reopens (silent) ──▶ next winner: buzz-in again
```

## Device by device

| Device | Plays |
|---|---|
| Host device (TV) | Chime, time's-up, Daily Double, Double Schmegettes, buzz-in. The buzzer thunk too, when the host plays and presses their buzzer |
| Phone | Only its own buzzer thunk |

## Edge cases

| Situation | Behavior |
|---|---|
| Sound is blocked on the TV (iOS, no tap yet) | The existing "Tap to turn on sound" button covers sounds and the narrator together. Until then, sounds are skipped silently |
| A sound file fails to load | That sound is skipped; the game runs on its usual timings |
| The narrator's line isn't ready when the sound ends | The line starts when it's ready, as today. The board's return still has the 6 s cap |
| The host device pauses (disconnects) during a sound | The sound stops. On return the screen resumes without replaying it |
| A player presses the buzzer twice quickly in `lit` | One thunk per press that's sent; the second press is ignored by the server as usual |
| Phone or host device with the ring/silent switch on | Sounds still play, at media volume. The volume buttons control them |
| Host overrides a verdict during the correct-response screen | No sound replays. The new verdict shows silently ([overrides](../scoreboard-and-overrides/feature-brief.md)) |
| Reduced motion turned on | Sounds are unchanged |
| The host plays and wins the buzz | Their thunk plays at the press, then the buzz-in when the server confirms; both on the host device |
| Two players buzz within a few milliseconds | One buzz-in, for the winner the server picked |
| The host device reconnects or reloads during `answering` | No buzz-in replays; the answering screen shows silently |
| The winner's phone (or the host device) hears the buzz-in through its microphone | It's not a word, so it isn't taken as part of the answer. The answer is judged on what the player said |
