# Wagers: Interaction Design

## States

### Daily Double

```text
board ──pick DD──▶ daily_double_wager ──wager / 30 s──▶ clue_reading ──speech ends──▶ answering
  ▲                (2 s reveal, then wager)              (no buzzing)                    │
  └──────────────────── 6 s correct response ◀──── judged (± wager) ◀────────────────────┘
```

`clue_reading` for a Daily Double never opens buzzing: when speech ends (or on the fallback timer) it goes straight to `answering` for the player who picked it.

### Final Schmegettes

```text
Double board done ──▶ any score > 0? ──no──▶ finished (4 s "Nobody's in the black")
                           │ yes
                           ▼
final_category ──▶ final_wager ──all locked / 30 s──▶ final_answer ──all locked / 30 s──▶ final_reveal ──▶ finished
 (3 s title,        (secret)                          (clue read, then                    (lowest score
  category read)                                       30 s to answer)                     first, ~8 s each)
```

Phase names are the contract in `shared/schemas/domain.schema.json`.

## Timing

| Step | Time |
|---|---|
| "DAILY DOUBLE" reveal | 2 s |
| Daily Double wager | 30 s, then $5 |
| "Alice wagers $1,000" | 2 s |
| Daily Double answer | From end of reading until quiet, at most 14 s |
| "FINAL SCHMEGETTES" title | 3 s |
| Final category on screen | Until the narrator finishes, at least 3 s |
| Final wager | 30 s, or until every finalist locks in. Unlocked: $0 |
| Final answer | 30 s from the end of reading, or until every finalist locks in |
| Reveal, per finalist | About 8 s (response, verdict, wager, new score, about 2 s apart) |
| "Nobody's in the black" | 4 s |

## Screens

### Host device (TV)

The two-column layout from [gameplay](../gameplay/interaction-design.md) stays: stage on the left, player column on the right.

**Daily Double reveal (2 s):** the stage shows "DAILY DOUBLE" in `yellow.4`, Oswald, as large as fits, over `boardBlue.9`, with the category small above it. Narrator: "It's a Daily Double."

**Daily Double wager:**

```text
│          VOLCANOES · DAILY DOUBLE           │┏━━━━━━━━━━━━━━━┓│
│                                             │┃ Alice $1,200  ┃│
│            Alice is wagering…               │┃ WAGERING      ┃│
│              $5 – $1,200                    │┗━━━━━━━━━━━━━━━┛│
│          ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 30 s            │  Bob      $400  │
```

Then "Alice wagers $1,000" for 2 s, the reading ("For 1,000, here's the clue."), and the answer screen from gameplay, with the wager in place of the value ("VOLCANOES · DD $1,000").

**Final category:** "FINAL SCHMEGETTES" title for 3 s, then the stage shows the category, uppercase, as large as fits.

**Final wager:** the category stays on the stage, with a 30 s countdown bar. Each finalist's tile in the player column shows "wagering…" or "✓ locked". Non-finalists' tiles are dimmed and show "not in Final". **No amounts.**

**Final answer:** the clue on the stage, read aloud. Then a 30 s countdown bar. Tiles show "answering…" or "✓ locked in". No transcripts.

**Final reveal:** the stage shows one finalist at a time:

```text
│              BOB  ·  $400                   │
│                                             │
│        Response:  what is Krakatoa          │
│                   ✓ correct                 │
│        Wager:     $400                      │
│        Score:     $800                      │
```

Lines appear about 2 s apart. The score in that player's tile updates on the last line. After the last finalist, the correct response is shown for 4 s, then the final scores (highest first, winners marked 🏆).

### Phone

| Phase | Above the buzzer | Buzzer |
|---|---|---|
| `daily_double_wager`, mine | "Daily Double! Volcanoes", my score, the range, the number pad with **Min** / **Max**, and **Wager** | `idle` |
| `daily_double_wager`, someone else's | "Alice is wagering…" | `idle` |
| DD `clue_reading`, mine | "Listen… you'll answer when the clue ends." | `idle` |
| DD `answering`, mine | Mic level meter and live transcript | `answering` |
| DD, someone else's | "Alice is answering a Daily Double." | `idle` |
| `final_category` / `final_wager`, finalist | "Final: {category}", my score, number pad from $0 to my score, **Min** ($0) / **Max** (all), **Lock in** | `idle` |
| After locking the wager | "Wager locked: $600. Look at the TV." | `idle` |
| `final_answer`, finalist | "Answer quietly into your phone." Mic level meter, then "Locked in: *what is Krakatoa*" | `answering`, then `idle` |
| Not a finalist | "You're not in Final. Watch the TV." | `idle` |
| `final_reveal` | "Look at the TV." | `idle` |
| `finished` | My final score and place | `idle` |

**Number pad.** Digits, backspace, **Min**, **Max**. The confirm button is disabled until the amount is inside the limits, and the hint under the amount says why ("At most $1,200"). Leading zeros are dropped. A Final phone shows its own transcript once locked, because it's the player's own phone. The host device never does (below).

### Host device when the host plays

| Phase | Player column |
|---|---|
| `daily_double_wager`, host's | Number pad and **Wager**, visible to the room. Daily Double wagers are public. |
| DD `answering`, host's | Buzzer green "Answer now"; mic level meter |
| `final_wager` | Masked field `$ •••••`. Digits show as dots. **Min** / **Max** don't show the amount. The tile shows "wagering…" like anyone else's. |
| `final_answer` | "Answer now" with a mic meter, then "✓ locked in". **No transcript.** |

## Flows

### A Daily Double

1. Alice has control with $1,200 and picks VOLCANOES 600. It's the Daily Double.
2. The TV shows "DAILY DOUBLE". Alice's phone shows the number pad and "$5 – $1,200".
3. Alice taps 1 0 0 0 and **Wager**. The TV shows "Alice wagers $1,000".
4. The narrator says "For 1,000, here's the clue." and reads it. Alice's phone starts listening when the reading ends.
5. Alice says "what is Etna": correct. She now has $2,200 and keeps control. The correct response shows for 6 s, then the board.

### Final Schmegettes

1. The Double board ends. Alice $2,200, Bob $400, Wyatt (host, playing) −$200. Alice and Bob are finalists; Wyatt's tile says "not in Final".
2. "FINAL SCHMEGETTES", then the category "FAMOUS ISLANDS", read aloud.
3. Bob locks in $400 and Alice locks in $700 on their phones. The TV shows "✓ locked" for each, no amounts.
4. The clue is read. Both phones listen. Bob says "Krakatoa", Alice says "Krakatoa" too. Each sees "Locked in" on their own phone.
5. Reveal, lowest first. Bob: "Krakatoa" ✓, $400, $800. Alice: "Krakatoa" ✓, $700, $2,900.
6. Correct response, then final scores: Alice $2,900 🏆, Bob $800, Wyatt −$200. The game is recorded as finished.

## Edge cases

| Situation | Behavior |
|---|---|
| Daily Double picked by a player with a negative score | Range is $5 – $800 (Single) or $5 – $1,600 (Double) |
| Player confirms a wager the instant the 30 s ends | The first event the server receives wins. A late wager is ignored, and the $5 / $0 default stands |
| Daily Double player says nothing for 14 s | Incorrect: −wager |
| Daily Double player's microphone is blocked | No answer, so −wager. The phone warns before the wager, as it does before every clue |
| The last clue of the Double board is a Daily Double | It plays normally, then Final starts |
| Exactly one finalist | Final runs for that player alone. The reveal has one step |
| Finalist's phone hears speech before they talk (someone nearby) | The first speech heard locks in. The phone shows the transcript, so the player sees what was taken. Feature 3's host override can correct it |
| Finalist locks a $0 wager | Allowed. Correct or not, their score doesn't change |
| Every finalist locks in before 30 s | The phase moves on at once |
| Two finalists tie for the lowest score | The one who joined first is revealed first |
| Top score tied after the reveal | Both are marked 🏆. No tiebreak |
| A non-finalist taps the buzzer | Press animation only |
| Host device disconnects during the reveal | Paused. On return, the reveal restarts that finalist's step |
| Phone reconnects mid-Final | It gets the current phase, its own locked wager and answer state, and nothing about other players' amounts |
