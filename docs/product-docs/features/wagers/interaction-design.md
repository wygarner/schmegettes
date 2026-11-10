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
final_category ──▶ final_wager ──all locked / 30 s──▶ final_answer ──all submitted / 30 s──▶ final_reveal ──▶ finished
 (3 s title,        (secret)                          (clue read, then                    (lowest score
  category read)                                       30 s to type)                       first, ~8 s each)
```

Phase names are the contract in `shared/schemas/domain.schema.json`.

## Timing

| Step | Time |
|---|---|
| "DAILY DOUBLE" reveal | 2 s |
| Daily Double wager | 30 s, then $5 |
| "Alice wagers $1,000" | 2 s |
| Daily Double answer | From end of reading until quiet, at most 9 s |
| "FINAL SCHMEGETTES" title | 3 s |
| Final category on screen | Until the narrator finishes, at least 3 s |
| Final wager | 30 s, or until every finalist locks in. Unlocked: $0 |
| Final answer | Typing opens when the clue appears; 30 s from the end of reading, or until every finalist submits |
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

**Final answer:** the clue on the stage, read aloud. Then a 30 s countdown bar. Tiles show "writing…" or "✓ submitted". No answers.

**Final reveal:** the stage shows one finalist at a time:

```text
│              BOB  ·  $400                   │
│                                             │
│        Response:  what is Krakatoa          │
│                   ✓ correct                 │
│        Wager:     $400                      │
│        Score:     $800                      │
```

Lines appear about 2 s apart. The score in that player's tile updates on the last line. After the last finalist, the correct response is shown for 4 s and read aloud ("The correct response is Krakatoa."), then the final scores (highest first, winners marked 🏆).

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
| `final_answer`, finalist | "Type your answer." Text field with the keyboard up, countdown, **Submit**. After submitting: "Submitted: *what is Krakatoa*" | `idle` |
| Not a finalist | "You're not in Final. Watch the TV." | `idle` |
| `final_reveal` | "Look at the TV." | `idle` |
| `finished` | My final score and place | `idle` |

**Number pad.** Digits, backspace, **Min**, **Max**. The confirm button is disabled until the amount is inside the limits, and the hint under the amount says why ("At most $1,200"). Leading zeros are dropped. **Final answer field.** One line, autofocused, autocorrect and autocapitalize off (so the phone doesn't "fix" a name), at most 200 characters. **Submit** (or the keyboard's return key) is disabled while the field is empty. The countdown sits above the field so the keyboard never covers it. A phone shows its own answer after submitting, because it's the player's own phone. The host device never does (below).

### Host device when the host plays

| Phase | On the host device |
|---|---|
| `daily_double_wager`, host's | Number pad and **Wager** on the **stage**, under "VOLCANOES · DAILY DOUBLE", visible to the room. Daily Double wagers are public. |
| DD `answering`, host's | Buzzer turns green; mic level meter |
| `final_wager` | Masked number pad on the stage, under the category. Digits show as dots, keys never highlight, **Min** / **Max** don't show the amount. The tile shows "wagering…" like anyone else's. |
| `final_answer` | Blind keypad on the stage under the clue (the clue text shrinks to fit): A to Z, space, backspace, a masked field `•••••` and **Submit**, then "✓ submitted". Keys never highlight. **The answer is never shown.** |

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
4. The clue is read. Bob types "krakatoa" and submits after 12 s. Alice types "what is krakatau" and is still editing when time runs out, so her draft is submitted. The TV shows "✓ submitted" for each.
5. Reveal, lowest first. Bob: "krakatoa" ✓, $400, $800. Alice: "what is krakatau" ✓, $700, $2,900.
6. Correct response, then final scores: Alice $2,900 🏆, Bob $800, Wyatt −$200. The game is recorded as finished.

## Edge cases

| Situation | Behavior |
|---|---|
| Daily Double picked by a player with a negative score | Range is $5 – $800 (Single) or $5 – $1,600 (Double) |
| Player confirms a wager the instant the 30 s ends | The first event the server receives wins. A late wager is ignored, and the $5 / $0 default stands |
| Daily Double player says nothing for 9 s | Incorrect: −wager |
| Daily Double player's microphone is blocked | No answer, so −wager. The phone warns before the wager, as it does before every clue |
| The last clue of the Double board is a Daily Double | It plays normally, then Final starts |
| Exactly one finalist | Final runs for that player alone. The reveal has one step |
| Finalist submits a typo ("Krakatowa") | Judged generously, like a mishearing: correct |
| Finalist taps Submit by accident on a half-typed answer | It's locked. Submitting is final, like a spoken answer |
| Finalist's phone disconnects mid-typing | The last draft the server got is submitted at 30 s. On reconnect they see that draft and keep typing |
| Keyboard covers part of a small phone screen | The field, countdown and Submit sit above the keyboard; the score and category hide |
| Finalist locks a $0 wager | Allowed. Correct or not, their score doesn't change |
| Every finalist submits before 30 s | The phase moves on at once |
| Two finalists tie for the lowest score | The one who joined first is revealed first |
| Top score tied after the reveal | Both are marked 🏆. No tiebreak |
| A non-finalist taps the buzzer | Press animation only |
| Host device disconnects during the reveal | Paused. On return, the reveal restarts that finalist's step |
| Phone reconnects mid-Final | It gets the current phase, its own locked wager, and its own draft or submitted answer, and nothing about other players |
