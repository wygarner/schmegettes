# Gameplay: Interaction Design

## States of a clue

```text
board ──pick──▶ clue_reading ──speech ends / timer──▶ buzzing_open ──buzz──▶ answering
  ▲                                                     │   ▲                  │
  │                                       5 s, no buzz  │   └── incorrect, ────┤
  │                                                     ▼       others left    │ correct, or
  └────────────── 3 s (TV shows correct response) ◀── clue ends ◀──────────────┘ nobody left
```

Phase names are the contract in `shared/schemas/domain.schema.json`: `board`, `clue_reading`, `buzzing_open`, `answering`. The "correct response" screen is the end of `answering` or `buzzing_open`, before `board`.

## Timing

| Step | Time |
|---|---|
| Pick a clue | No limit. After 15 s the TV hints that the host can pick. |
| Reading | Until speech ends. Fallback: about 2.5 words per second + 1 s, at most 12 s |
| Early-buzz lockout | 250 ms |
| Buzz window (and each reopen) | 5 s |
| Answer | Until the player goes quiet, at most 7 s |
| Correct response on screen | 3 s |
| "Double Jeopardy!" interstitial | 3 s |

## Screens

### TV (host device)

**Board:**

```text
┌────────────────────────────────────────────────────────────────┐
│ SCIENCE │ POTPOURRI │ 80s TV │ CAPITALS │ RHYME TIME │ OPERA   │
│   200   │    200    │  200   │   ·····  │    200     │  200    │
│   400   │    400    │  400   │   400    │    400     │  400    │
│   …                                                            │
├────────────────────────────────────────────────────────────────┤
│  Alice $1,200 ◀ picking     Bob $400     Wyatt −$200           │
└────────────────────────────────────────────────────────────────┘
```

- Design system: `boardBlue.9` cells, values in `yellow.4` weight 800, category headers uppercase white. A finished clue shows an empty cell.
- The score bar marks who has control ("◀ picking").
- Tapping a cell picks it, because the host device can always pick.

**Clue:** the clue text full screen, uppercase, white on `boardBlue.9`, with the category and value small above it. Spoken aloud.

**Buzzing open:** a thin lit border around the clue and a 5 s countdown bar.

**Answering:** "Alice" under the clue, with a listening indicator and her live transcript as she speaks.

**Judged:**
- Correct: "✓ Alice: *what is Paris*" in `green` and "+$400", then the correct response.
- Incorrect: "✗ Alice: *Lyon*" in `red` and "−$400". Buzzing reopens.

**Clue ends:** "Correct response: **Paris**" for 3 s.

**Paused (host device reconnecting):** the TV comes back where it was. Phones show "Waiting for the TV…".

**Game over:** the final scores, highest first, e.g. "Alice $5,600 · Bob $3,200 · Wyatt −$400" (until feature 3).

### Phone (contestant)

| Phase | Phone shows |
|---|---|
| `board`, I have control | Mini board: category names and values. Tap to pick, or tap **🎤 Say it** and say "Science for 400". "Your pick" |
| `board`, someone else picks | "Alice is picking…" and my score |
| `clue_reading` | Big **BUZZ** button, dim. "Listen…" |
| `buzzing_open` | **BUZZ** lit, full width, at least 64 px tall ([design system](../../architecture/design-system.md)) |
| Early buzz | Button flashes red: "Too early" (250 ms) |
| I won the buzz | "Answer now", with a mic level meter and my live transcript |
| Someone else answering | "Bob is answering…" |
| I already tried this clue | **BUZZ** locked: "You've answered this one" |
| After judging | "✓ +$400" or "✗ −$400" for 2 s |
| Game over | My final score and place |

The phone never shows clue text or the correct response.

### Host device player bar (when the host plays)

The same states as the phone table, in the player bar described in the [lobby interaction design](../lobby/interaction-design.md). The space bar buzzes.

## Flows

### A clue, start to finish

1. Alice has control and taps "SCIENCE 400" on her phone.
2. The TV shows the clue and reads it ("This gas makes up about 78% of Earth's atmosphere").
3. Speech ends, buzzing opens, and every buzzer lights.
4. Bob buzzes 180 ms later and wins. His phone shows "Answer now".
5. Bob says "oxygen" and is judged incorrect: −$400. Buzzing reopens for everyone except Bob.
6. Alice buzzes and says "what is nitrogen": correct, +$400, and she keeps control.
7. The TV shows "Correct response: Nitrogen" for 3 s, then the board with SCIENCE 400 gone.

### Microphone permission

- The first time a phone wins a buzz, the browser asks for the microphone. To avoid that delay mid-game, phones ask during the **lobby**: "Allow the microphone so you can answer". The prompt appears after joining, and again on Start if not yet allowed.
- Microphone blocked: the phone shows "Turn on the microphone to answer" with how to do it. That player's buzzer is still live, and a buzz with no microphone counts as no answer (incorrect), so the phone warns them before every clue.
- Browser can't do speech recognition: show "This browser can't hear answers. Try Chrome or Safari." right after joining.

## Edge cases

| Situation | Behavior |
|---|---|
| Controller taps a clue that's already done | Ignored; the cell is disabled |
| Controller says a clue that's already done, or one that isn't on the board | "That one's already been played." / "Didn't catch the category." Nothing is picked; try again or tap |
| Controller and host device pick at once | The first pick the server receives wins; the other is ignored |
| Speech synthesis unavailable on the host device | Clue shown silently; buzzing opens on the fallback timer |
| A player buzzes during `answering` | Ignored (not a lockout) |
| Everyone has tried and all were wrong | Clue ends, correct response shown, control unchanged |
| Transcript is empty after 7 s (connected) | Incorrect |
| Phone disconnects while answering | No penalty, buzzing reopens for the others, and that player is out for this clue |
| Phone reconnects mid-clue | It gets the current phase and buzzer state. If it already tried this clue, its buzzer is locked |
| Host device disconnects mid-clue | Paused. On return the clue is read again from the start, and buzzing reopens for those who haven't tried |
| Only one contestant left connected | Play continues |
| A Daily Double square | Plays as a normal clue until feature 2 |
