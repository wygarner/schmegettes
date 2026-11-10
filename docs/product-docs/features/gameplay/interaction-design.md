# Gameplay: Interaction Design

## States of a clue

```text
board ──pick──▶ clue_reading ──speech ends / timer──▶ buzzing_open ──buzz──▶ answering
  ▲                                                     │   ▲                  │
  │                                       5 s, no buzz  │   └── incorrect, ────┤
  │                                                     ▼       others left    │ correct, or
  └────────────── 6 s (TV shows correct response) ◀── clue ends ◀──────────────┘ nobody left
```

Phase names are the contract in `shared/schemas/domain.schema.json`: `board`, `clue_reading`, `buzzing_open`, `answering`. The "correct response" screen is the end of `answering` or `buzzing_open`, before `board`.

## Timing

| Step | Time |
|---|---|
| Pick a clue | No limit while the controller is connected. Controller disconnected for 10 s: control passes to the next connected contestant in join order. |
| Reading | "Here's {category} for {value}." then the clue, until speech ends. Fallback: about 2.5 words per second + 1 s over both, at most 14 s |
| Early-buzz lockout | 250 ms |
| Buzz window (and each reopen) | 5 s |
| Answer | Until the player goes quiet, at most 14 s |
| Correct response on screen | 6 s |
| "Double Schmegettes!" interstitial | 3 s |

## Screens

### Host device (iPhone in landscape, mirrored to the TV)

**Viewport.** Design target 844 × 390 (iPhone 12–16, landscape). Everything fits without scrolling from 667 × 320 (iPhone SE with Safari's bars showing) up to 956 × 440 (Pro Max), inside the safe-area insets for the notch and home indicator. Larger screens get the same layout, scaled.

**Layout.** Two columns on every game screen. The left column (about 72% of the width) is the stage: board, clue, or correct response. The right column (about 28%, at least 180 px) is the **player column**: a tile per contestant with name and score, always visible, and the host's buzzer at the bottom when the host plays.

**Board:**

```text
┌───────────────────────────────────────────────────┬───────────────────┐
│ VOLCA- │ POTPOU-│ 80s TV │ CAPI-  │ RHYME │ OPERA  │┏━━━━━━━━━━━━━━━━━┓│
│ NOES   │ RRI    │        │ TALS   │ TIME  │        │┃ Alice   $1,200  ┃│ ◀ picking:
│  200   │  200   │  200   │        │  200  │  200   │┃ PICKING         ┃│   yellow.4 border
│  400   │  400   │  400   │  400   │  400  │  400   │┗━━━━━━━━━━━━━━━━━┛│
│  600   │  600   │  600   │  600   │  600  │  600   │  Bob       $400   │
│  800   │  800   │  800   │  800   │  800  │  800   │  Wyatt    −$200   │
│                                                    │ ┌───────────────┐ │
│                                                    │ │ (red buzzer)  │ │ ◀ only when the
│                                                    │ └───────────────┘ │   host plays
└───────────────────────────────────────────────────┴───────────────────┘
```

- Board: 6 categories × 4 rows (Single 200–800, Double 400–1,600). `boardBlue.9` cells, values in `yellow.4` weight 800, category headers uppercase white, wrapping to at most 3 lines and shrinking to fit. A finished clue shows an empty cell.
- **The board is tappable only when the host plays and has control.** Otherwise taps do nothing, and the cells don't show a pressed state.
- No caption under the board: no "Waiting for … to pick", no host-pick hint.

**Player column (every game screen):**

- One tile per contestant in join order: name (truncated with …) and score (`money`, can be negative).
- **The tile of the player in control is highlighted**: `yellow.4` border, 3 px, and a small "PICKING" label. Only one tile is highlighted at a time; during a clue the highlight stays on the player in control.
- Disconnected players' tiles are dimmed with "(reconnecting)".
- At most 6 contestants. Up to 4: two-line tiles (name, then score). 5 or 6: one-line tiles (name, PICKING, score). Tiles share the column's height (one-line tiles up to 48 px), so 6 tiles and the host's buzzer fit at 667 × 320 (about 35 px each there).
- When the host plays, their buzzer sits at the bottom of the column, at least 64 px tall, and the tiles share the space above it.

**Clue (`clue_reading`, `buzzing_open`, `answering`):** the stage shows the category and value small at the top ("VOLCANOES · $400"), and the clue text uppercase, white on `boardBlue.9`, as large as fits. The narrator says "Here's Volcanoes for 400." and then reads the clue.

**Buzzing open:** a lit `yellow.4` border around the stage and a 5 s countdown bar.

**Answering:** the answering player's name under the clue, with a listening indicator and their live transcript.

**Judged:**
- Correct: "✓ Alice: *what is Paris*" in `green` and "+$400".
- Incorrect: "✗ Alice: *Lyon*" in `red` and "−$400". Buzzing reopens.

**Correct response (6 s):** the clue text is **gone**, and the narrator says "Correct, Mauna Loa is the right answer." when someone got it, or "Sorry, we were looking for Mauna Loa." when nobody did (wrong answers, no buzz, a missed Daily Double) The stage shows:

```text
│            VOLCANOES · $400               │
│                                           │
│        ✓ Alice: what is Mauna Loa  +$400  │
│                                           │
│          Correct response:                │
│             MAUNA LOA                     │
```

The verdict line appears only when the clue ended on a judged answer. A clue nobody buzzed on shows just the category, value and correct response.

**"Double Schmegettes!" (3 s), paused, game over:** shown on the stage; the player column stays.

**Portrait.** On a phone-sized host device held upright, the screen shows "Turn your phone sideways" over the view. The game keeps running underneath.

### The buzzer (one component everywhere)

Phones and the host device use the same `Buzzer` component: an oblong red dome the full width of its container, in a dark rim, with **no lettering** ([design system](../../architecture/design-system.md#buzzer)). Only its height changes: 120 px on phones, 64 px in the host's column. State shows in the dome's color, light and motion. For screen readers the button is always named "Buzz", and the state is its description.

| State | Looks | Screen-reader description | A tap |
|---|---|---|---|
| `idle`: lobby, board (not in control), between clues, someone else answering | Unlit dark red | Not now | Press animation only. Nothing is sent. |
| `dim`: `clue_reading` | Unlit, faint red ring around the rim | Get ready | Early buzz: 250 ms lockout |
| `lit`: `buzzing_open` | Bright red, pulsing glow | Buzz now | Buzz |
| `early` | Dark red, shakes, 250 ms | Too early | Nothing |
| `answering`: I won the buzz | Green, glowing | Answer now | Nothing |
| `locked`: I already tried this clue | Grey, faded, disabled | You've answered this one | Nothing |
| `pick`: `board`, I have control | Bright red, breathing slowly | Press and say your pick | Starts listening for a spoken pick. Nothing is sent until a pick is heard |
| `listening`: listening for my pick | Green, glowing | Listening for your pick | Stops listening; nothing is picked |

With no words on the button, the phone's screen above it says what the color means: "Listen… Buzz when it lights up. Too early locks you out for a moment." while the clue is read, "Say your answer" after a won buzz, "You've answered this one" once locked, and "Tap a clue, or press and say it" under the buzzer when I'm picking.

The host device also buzzes with the space bar when a keyboard is attached; on the board, when the host has control, the space bar starts a spoken pick like the buzzer does.

### Phone (contestant)

The buzzer is pinned to the bottom of the phone screen on every screen from the lobby on. What's above it changes with the phase:

| Phase | Above the buzzer | Buzzer |
|---|---|---|
| Lobby | "You're in, Alice." Microphone prompt, **Edit name**, **Leave** | `idle` |
| `board`, I have control | Mini board (category names and values). No "Your pick" heading, no score, no microphone button: the buzzer is it. While listening, a green "Listening… Say a category and value, like “Opera for 600”" panel. | `pick`, `listening` while it listens |
| `board`, someone else picks | "Alice is picking…" and my score | `idle` |
| `clue_reading` | "Listen…" | `dim` |
| `buzzing_open` | "Buzz in!" and the 5 s countdown | `lit` |
| Early buzz | — | `early` |
| I won the buzz | Mic level meter and my live transcript | `answering` |
| Someone else answering | "Bob is answering…" | `idle` (or `locked` if I already tried) |
| After judging (mine) | "✓ +$400" or "✗ −$400" for 2 s | `idle` / `locked` |
| Correct response on the TV | "Look at the TV." | `idle` |
| Game over | My final score and place | `idle` |

The phone never shows clue text or the correct response.

**Pick confirmation (tap only):**

```text
┌──────────────────────────────┐
│     Volcanoes for $400?      │
│                              │
│   [ Cancel ]     [  Pick  ]  │
└──────────────────────────────┘
```

- A tap on a board cell opens the confirmation: a sheet that slides up from the bottom on a phone, a centered sheet on the host device. **Pick** (gold) sends the pick, **Cancel** or a tap outside closes it.
- A spoken pick ("Volcanoes for 400") goes straight through, with no modal.
- The modal closes on its own if the phase leaves `board` or the player loses control while it's open.

### Host device when the host plays

The same states as the phone, in the player column, minus what the stage already shows: the column keeps only the host's spoken pick ("Listening…", the words as they're heard, and why a pick failed), live transcript and verdict above the buzzer. When the host has control, the host's buzzer is in `pick`: pressing it (or the space bar) listens for the host's spoken pick. It shows: the host's tile, the buzzer at the bottom of the column, and the board on the stage tappable when the host has control. A tapped pick on the host device gets the same confirmation modal; a spoken pick doesn't. See the [lobby interaction design](../lobby/interaction-design.md).

## Flows

### A clue, start to finish

1. Alice has control; her tile on the TV is highlighted. She taps "VOLCANOES 400" on her phone and confirms **Pick**.
2. The TV shows the clue. The narrator says "Here's Volcanoes for 400." and reads the clue.
3. Speech ends, buzzing opens, and every buzzer lights.
4. Bob buzzes 180 ms later and wins. His buzzer turns green and his phone says "Say your answer".
5. Bob says "Kilauea" and is judged incorrect: −$400. Buzzing reopens for everyone except Bob.
6. Alice buzzes and says "what is Mauna Loa": correct, +$400, and she keeps control.
7. The clue text disappears. The TV shows "Correct response: Mauna Loa" for 6 s, then the board with VOLCANOES 400 gone. Alice's tile is still highlighted.

### Microphone permission

- The first time a phone wins a buzz, the browser asks for the microphone. To avoid that delay mid-game, phones ask during the **lobby**: "Allow the microphone so you can answer". The prompt appears after joining, and again on Start if not yet allowed.
- Microphone blocked: the phone shows "Turn on the microphone to answer" with how to do it. That player's buzzer is still live, and a buzz with no microphone counts as no answer (incorrect), so the phone warns them before every clue.
- Browser can't do speech recognition: show "This browser can't hear answers. Try Chrome or Safari." right after joining.

## Edge cases

| Situation | Behavior |
|---|---|
| Controller taps a clue that's already done | Ignored; the cell is disabled |
| Controller says a clue that's already done, or one that isn't on the board | "That one's already been played." / "Didn't catch the category." Nothing is picked; the buzzer goes back to `pick`: press it to try again, or tap |
| Controller presses the buzzer while it's listening | Listening stops; nothing is picked |
| Control passes or the phase changes while listening | Listening stops; nothing is picked |
| Controller confirms a tap and says a clue at the same moment | The first pick the server receives wins; the other is ignored |
| Someone taps the TV board without control (host not playing, or not their turn) | Nothing happens. No pick is sent |
| A non-controller sends a pick anyway | The server rejects it (`not_in_control`) |
| Controller disconnects on the board | 10 s later control passes to the next connected contestant in join order, and that tile highlights. Back within 10 s: they keep control |
| Controller is the only connected contestant and disconnects | Control stays with them; the game waits |
| Confirmation modal open when control passes or the phase changes | The modal closes; nothing is picked |
| Speech synthesis unavailable on the host device | Clue shown silently; buzzing opens on the fallback timer |
| A player taps the buzzer outside a clue (lobby, board, between clues) | Press animation only. No lockout, nothing sent. Exception: the player in control on the board starts a spoken pick |
| A player buzzes during `answering` | Ignored (not a lockout) |
| Everyone has tried and all were wrong | Clue ends, correct response shown for 6 s without the clue, control unchanged |
| Transcript is empty after 14 s (connected) | Incorrect |
| Phone disconnects while answering | No penalty, buzzing reopens for the others, and that player is out for this clue |
| Phone reconnects mid-clue | It gets the current phase and buzzer state. If it already tried this clue, its buzzer is locked |
| Host device disconnects mid-clue | Paused. On return the announcement and clue are read again from the start, and buzzing reopens for those who haven't tried |
| 6 contestants plus the host's buzzer on a 667 × 320 screen | One-line tiles of about 35 px; all 4 board rows stay visible |
| Only one contestant left connected | Play continues |
| A Daily Double square | Wager, then the picker answers alone ([wagers](../wagers/interaction-design.md)) |
