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
```

## Device by device

| Device | Plays |
|---|---|
| Host device (TV) | Chime, time's-up, Daily Double, Double Schmegettes. The buzzer thunk too, when the host plays and presses their buzzer |
| Phone | Only its own buzzer thunk |

## Edge cases

| Situation | Behavior |
|---|---|
| Sound is blocked on the TV (iOS, no tap yet) | The existing "Tap to turn on sound" button covers sounds and the narrator together. Until then, sounds are skipped silently |
| A sound file fails to load | That sound is skipped; the game runs on its usual timings |
| The narrator's line isn't ready when the sound ends | The line starts when it's ready, as today. The board's return still has the 6 s cap |
| The host device pauses (disconnects) during a sound | The sound stops. On return the screen resumes without replaying it |
| A player presses the buzzer twice quickly in `lit` | One thunk per press that's sent; the second press is ignored by the server as usual |
| Phone in silent mode (iPhone ring/silent switch) | Web sounds follow the phone's media volume; whether the switch mutes them depends on the browser. No message |
| Host overrides a verdict during the correct-response screen | No sound replays. The new verdict shows silently ([overrides](../scoreboard-and-overrides/feature-brief.md)) |
| Reduced motion turned on | Sounds are unchanged |
