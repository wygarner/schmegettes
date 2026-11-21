# Gameplay: Interaction Design

## States of a clue

```text
board ──pick──▶ clue_reading ──speech ends / timer──▶ buzzing_open ──buzz──▶ answering
  ▲                                                     │   ▲                  │
  │                                       9 s, no buzz  │   └── incorrect, ────┤
  │                                                     ▼       others left    │ correct, or
  └──── response read + 1 s (at most 6 s) ◀───────── clue ends ◀──────────────┘ nobody left
```

Phase names are the contract in `shared/schemas/domain.schema.json`: `board`, `clue_reading`, `buzzing_open`, `answering`. The 2.25 s pick reveal is the start of `clue_reading`. The "correct response" screen is the end of `answering` or `buzzing_open`, before `board`.

## Timing

| Step | Time |
|---|---|
| Pick a clue | No limit while the controller is connected. Controller disconnected for 10 s: control passes to the next connected contestant in join order. |
| Pick reveal | 2.25 s: the cell blinks (0.6 s), grows into the category card (0.6 s), and the card holds (1.05 s) |
| Reading | The clue only, until speech ends. Fallback: 2.25 s + about 2.5 words per second + 1 s, at most 14 s for the reading part |
| Early-buzz lockout | 250 ms |
| Buzz window (and each reopen) | 9 s |
| Answer | Until the player goes quiet, at most 9 s |
| Correct response on screen | Sound (under 1 s), the narrator's line, then 1 s. At most 6 s from the clue's end if the host device never reports the line's end |
| "Double Schmegettes!" interstitial | 3 s |

## Screens

### Host device (iPhone in landscape, mirrored to the TV)

**Viewport.** Design target 844 × 390 (iPhone 12–16, landscape). Everything fits without scrolling from 667 × 320 (iPhone SE with Safari's bars showing) up to 956 × 440 (Pro Max), inside the safe-area insets for the notch and home indicator. Larger screens get the same layout, scaled.

**Layout.** Two columns on every game screen. The left column (about 72% of the width) is the stage: board, clue, or correct response. The right column (about 28%, at least 180 px) is the **player column**: a tile per contestant with name and score, always visible, and the host's buzzer at the bottom when the host plays.

**Board:**

```text
┌───────────────────────────────────────────────────┬───────────────────┐
│ VOLCANOES│POTPOURRI │  80s TV  │ CAPITALS │  OPERA   │┏━━━━━━━━━━━━━━━━━┓│
│          │          │          │          │          │┃ Alice   $1,200  ┃│ ◀ picking:
│   200    │   200    │   200    │          │   200    │┃ PICKING         ┃│   yellow.4 border
│   400    │   400    │   400    │   400    │   400    │┗━━━━━━━━━━━━━━━━━┛│
│   600    │   600    │   600    │   600    │   600    │  Bob       $400   │
│   800    │   800    │   800    │   800    │   800    │  Wyatt    −$200   │
│                                                    │ ┌───────────────┐ │
│                                                    │ │ (red buzzer)  │ │ ◀ only when the
│                                                    │ └───────────────┘ │   host plays
└───────────────────────────────────────────────────┴───────────────────┘
```

- Board: **5 categories** × 4 rows (Single 200–800, Double 400–1,600). The five columns share the stage's full width, so each cell is a fifth wider than with six and headers wrap less. `boardBlue.9` cells, values in `yellow.4` weight 800, category headers uppercase white, wrapping to at most 3 lines and shrinking to fit. A finished clue shows an empty cell.
- **The board is tappable only when the host plays and has control.** Otherwise taps do nothing, and the cells don't show a pressed state.
- No caption under the board: no "Waiting for … to pick", no host-pick hint.

**Player column (every game screen):**

- One tile per contestant in join order: name (truncated with …) and score (`money`, can be negative).
- **The tile of the player in control is highlighted**: `yellow.4` border, 3 px, and a small "PICKING" label. Only one tile is highlighted at a time; during a clue the highlight stays on the player in control.
- Disconnected players' tiles are dimmed with "(reconnecting)".
- At most 6 contestants. Up to 4: two-line tiles (name, then score). 5 or 6: one-line tiles (name, PICKING, score). Tiles share the column's height (one-line tiles up to 48 px), so 6 tiles and the host's buzzer fit at 667 × 320 (about 35 px each there).
- When the host plays, their buzzer sits at the bottom of the column, at least 64 px tall, and the tiles share the space above it.

**Pick reveal (first 2.25 s of `clue_reading`):**

```text
0.0 s                      0.6 s → 2.25 s                2.25 s
┌──────────────────────┐   ┌──────────────────────┐      ┌──────────────────────┐
│ ▓▓ ░░ ▓▓ ░░ ▓▓       │   │   ┌──────────────┐   │      │  VOLCANOES · $400    │
│ cell blinks 3× in    │──▶│   │  VOLCANOES   │   │─────▶│                      │
│ yellow.4 / white     │   │   │     $400     │   │      │  THIS HAWAIIAN …     │
│ (the rest of the     │   │   └──────────────┘   │      │                      │
│  board stays put)    │   │ grows (0.6 s), holds │      │  clue screen; the    │
└──────────────────────┘   │ (1.05 s)             │      │  narrator reads      │
                           └──────────────────────┘      └──────────────────────┘
```

- **0–0.6 s:** the picked cell blinks three times (its value flashes `yellow.4` ↔ white). The rest of the board stays still.
- **0.6–1.2 s:** the cell lifts out of the board and grows, with an ease-out, into a card centered on the stage: about 60% of the stage's width, `boardBlue.9` with the board bevel, the category in white uppercase (Oswald) and the value in `yellow.4` below it ("$400"). The board dims behind it.
- **1.2–2.25 s:** the card holds, still, so the room can read the category and value. (It held 0.3 s before prod QA, 2026-11-19, asked for 0.75 s more.)
- **At 2.25 s:** the card shrinks into the clue screen's header ("VOLCANOES · $400") and the clue text appears. The narrator starts reading.
- No sound and no speech during the reveal. On a Daily Double, the blink is followed by the Daily Double reveal instead of the card ([wagers](../wagers/interaction-design.md)).
- With reduced motion turned on, the cell doesn't blink or fly: the card fades in and holds for the same 2.25 s.
- Phones: the buzzer goes `dim` at the pick, and the screen above it says "Volcanoes for $400" during the reveal, then "Listen…".

**Clue (`clue_reading`, `buzzing_open`, `answering`):** the stage shows the category and value small at the top ("VOLCANOES · $400"), and the clue text uppercase, white on `boardBlue.9`, as large as fits. The narrator reads the clue (no announcement first).

**Buzzing open:** a lit `yellow.4` border around the stage and a 9 s countdown bar.

**Answering:** the answering player's name under the clue, with a listening indicator and their live transcript.

**Judged:**
- Correct: "✓ Alice: *what is Paris*" in `green` and "+$400".
- Incorrect: "✗ Alice: *Lyon*" in `red` and "−$400". Buzzing reopens.

**Correct response:** the clue text is **gone**, a short sound plays (a chime when someone got it, a time's-up tone when nobody did: [sound effects](../sound-effects/feature-brief.md)), and then the narrator says "Correct, Mauna Loa is the right answer." when someone got it, or "Sorry, we were looking for Mauna Loa." when nobody did (wrong answers, no buzz, a missed Daily Double) The stage shows:

```text
│            VOLCANOES · $400               │
│                                           │
│        ✓ Alice: what is Mauna Loa  +$400  │
│                                           │
│          Correct response:                │
│             MAUNA LOA                     │
```

One second after the line ends, the board returns (at most 6 s after the clue ended, if the host device never reports the end of the line). The verdict line appears only when the clue ended on a judged answer. A clue nobody buzzed on shows just the category, value and correct response.

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
| Joining | Microphone screen (below), then the name | none until the player is in |
| Lobby | "You're in, Alice." **Edit name**, **Leave** | `idle` |
| `board`, I have control | Mini board (category names and values). No "Your pick" heading, no score, no microphone button: the buzzer is it. While listening, a green "Listening… Say a category and value, like “Opera for 600”" panel (with Lowest left: "Listening… Say a category, like “Opera”, or a category and value"). | `pick`, `listening` while it listens |
| `board`, someone else picks | "Alice is picking…" and my score | `idle` |
| `clue_reading` | "Listen…" | `dim` |
| `buzzing_open` | "Buzz in!" and the 9 s countdown | `lit` |
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
2. On the TV her cell blinks and grows into a "VOLCANOES / $400" card. 2.25 s after the pick the clue appears and the narrator reads it.
3. Speech ends, buzzing opens, and every buzzer lights.
4. Bob buzzes 180 ms later and wins. His buzzer turns green and his phone says "Say your answer".
5. Bob says "Kilauea" and is judged incorrect: −$400. Buzzing reopens for everyone except Bob.
6. Alice buzzes and says "what is Mauna Loa": correct, +$400, and she keeps control.
7. The clue text disappears. A chime plays, the TV shows "Correct response: Mauna Loa", the narrator says "Correct, Mauna Loa is the right answer.", and 1 s later the board is back with VOLCANOES 400 gone. Alice's tile is still highlighted.

### Microphone permission

**Nobody plays without a microphone.** Allowing it is the first thing a player does, and there's no way past it.

```text
┌──────────────────────────────┐
│            🎤                │
│  You answer out loud, so     │
│  Schmegettes needs your      │
│  microphone.                 │
│                              │
│   [   Allow microphone   ]   │
│                              │
│          Leave               │
└──────────────────────────────┘
```

- **When:** on a phone, right after the room code is accepted, before the name. On the host device, when the host presses **Join**. A host who only hosts is never asked.
- **Allow microphone** starts the same listening that answering uses, so the browser asks for everything it needs (on iPhone, the microphone and speech recognition) now and never mid-game.
- **Not added until allowed.** The player isn't in the room (not on the TV, not counted) until they allow it and enter their name. A host isn't added as a contestant until they allow it.
- **Blocked or "Don't Allow":** the screen says "Your microphone is blocked." with steps for that browser (iPhone Safari: **aA** → **Website Settings** → **Microphone** → **Allow**; Chrome: the icon left of the address → **Microphone** → **Allow**) and **Try again**. Only **Leave** gets out.
- **Browser can't hear answers** (no speech recognition): a stop screen, "This browser can't hear answers. Open {site} in Safari or Chrome." with **Leave**.
- **Asked again.** Some browsers (iPhone Safari) ask again on each visit. A reload or **Rejoin** shows the screen again before the player is back in their seat; until then their tile shows "(reconnecting)", as for any disconnect.
- **Lost mid-game** (the permission is turned off in Settings): the screen covers the game on that phone, and the player counts as disconnected (no buzzing, a pick in control passes after 10 s) until they allow it again.

## Edge cases

| Situation | Behavior |
|---|---|
| Controller taps a clue that's already done | Ignored; the cell is disabled |
| Controller says just a category with several clues left in it | Ask (default spoken clue value): "Didn't catch the amount.", nothing is picked, and the buzzer goes back to `pick`. Lowest left: the lowest value left in that category is picked |
| Controller says a clue that's already done, or one that isn't on the board | "That one's already been played." / "Didn't catch the category." Nothing is picked; the buzzer goes back to `pick`: press it to try again, or tap |
| Controller presses the buzzer while it's listening | Listening stops; nothing is picked |
| Control passes or the phase changes while listening | Listening stops; nothing is picked |
| Controller confirms a tap and says a clue at the same moment | The first pick the server receives wins; the other is ignored |
| Someone taps the TV board without control (host not playing, or not their turn) | Nothing happens. No pick is sent |
| A non-controller sends a pick anyway | The server rejects it (`not_in_control`) |
| Controller disconnects on the board | 10 s later control passes to the next connected contestant in join order, and that tile highlights. Back within 10 s: they keep control |
| Controller is the only connected contestant and disconnects | Control stays with them; the game waits |
| Confirmation modal open when control passes or the phase changes | The modal closes; nothing is picked |
| The host device can't run the Schmegettes voices | It can't host: the lobby says so and Start stays disabled ([lobby](../lobby/interaction-design.md)) |
| A line hasn't started 1.5 s after it should have, or fails | The line is skipped silently; the text stays on screen and buzzing opens on the fallback timer. The next line tries again ([feature brief](./feature-brief.md#the-narrators-voice)) |
| The host device reloads mid-game | The voice loads from the browser's storage. Lines before it's ready are skipped silently |
| The browser deleted the saved voice before a game | It downloads again in the lobby, and Start waits for it |
| A clue is picked while the previous correct response is still being read | Can't happen: the board returns only after the line ends |
| A player taps the buzzer outside a clue (lobby, board, between clues) | Press animation only. No lockout, nothing sent. Exception: the player in control on the board starts a spoken pick |
| A player buzzes during `answering` | Ignored (not a lockout) |
| Everyone has tried and all were wrong | Clue ends, time's-up sound, correct response read without the clue, board back 1 s later, control unchanged |
| Transcript is empty after 9 s (connected) | Incorrect |
| The answer sounds like the response but is spelled differently ("mona lowa" for Mauna Loa) | Correct. The verdict line shows what was heard: "✓ Alice: *mona lowa*". Rules in the [feature brief](./feature-brief.md#how-an-answer-is-matched) |
| Speech recognition offers several transcripts and only a less likely one matches | Correct. The verdict line shows the transcript that matched |
| Phone disconnects while answering | No penalty, buzzing reopens for the others, and that player is out for this clue |
| Phone reconnects mid-clue | It gets the current phase and buzzer state. If it already tried this clue, its buzzer is locked |
| Host device disconnects mid-clue | Paused. On return the clue is read again from the start (no pick reveal), and buzzing reopens for those who haven't tried |
| Host device disconnects during the pick reveal | Paused. On return the clue screen shows at once and the clue is read |
| 6 contestants plus the host's buzzer on a 667 × 320 screen | One-line tiles of about 35 px; all 4 board rows stay visible |
| Only one contestant left connected | Play continues |
| A Daily Double square | Wager, then the picker answers alone ([wagers](../wagers/interaction-design.md)) |
