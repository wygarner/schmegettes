# Design System

One component library for product UI and prototypes: **Mantine 9**. Prototypes in `devtools/src/designs/` and production code in `web/` use the same theme values, so a prototype looks like the real thing.

> Status: everything below "Theme" was designed in the design pass and is **not yet implemented** in `web/`. The reference prototypes are [system/components](../../../devtools/src/designs/system/components.tsx) (the kit, with a fit check for the host screen), [lobby/host-and-join](../../../devtools/src/designs/lobby/host-and-join.tsx), [board/clue-loop](../../../devtools/src/designs/board/clue-loop.tsx), [final/final-schmegettes](../../../devtools/src/designs/final/final-schmegettes.tsx) and [results/scoreboard-and-history](../../../devtools/src/designs/results/scoreboard-and-history.tsx). Run `mise run dev:devtools` to see them.

## Theme

```ts
{
  primaryColor: "boardBlue",
  colors: {
    boardBlue: ["#e8eaff", "#c9cdf7", "#a5abee", "#7f87e6", "#5f68df", "#4a53da", "#3f48d9", "#3139c1", "#2932ad", "#060ce9"],
  },
  fontFamily: "Inter, system-ui, sans-serif",
  headings: { fontFamily: "Oswald, Impact, sans-serif" },
}
```

Default color scheme: dark. `/product` and `/designer` refine this file; `web/src/main.tsx` is the source of truth for the values.

## Fonts

The app loads **Oswald** (500, 600, 700) and **Inter** (400 to 800). Today neither is loaded, so every heading falls back to Impact.

| Use | Font |
|---|---|
| Room code, board values, scores, wagers, big moments (DAILY DOUBLE, FINAL SCHMEGETTES), headlines on phones | Oswald 700, values and scores 600 |
| Clue text and correct responses | Oswald 500, uppercase. Condensed, so a long clue fits the 667 × 320 host screen |
| Category headers | Inter 700, uppercase |
| Everything else | Inter |

Board values are Oswald 700. Oswald has no 800 weight.

## Color

| Token | Value | Use |
|---|---|---|
| Night | `#03041c` | Host screen behind the stage and board; base of the phone background |
| Stage | radial gradient `#0d14c8` → `#070c86` → `#040746`, lighter at the top | The panel behind clues, the lobby, Daily Double, Final, and the scoreboard |
| Phone background | `#0a0f5c` at the top, fading to Night | Every phone screen |
| `boardBlue.9` | `#060ce9` | Board cells and category headers, with a bevel (light top edge, dark bottom edge) |
| Tile | `boardBlue.9` gradient, slightly lighter at the top | Player tiles, lobby rows |
| `yellow.4` (gold) | `#ffd43b` | Values, scores, the control ring, the stage's lit border, **the main action** (Start, Pick, Wager, Lock in, Submit, Rematch) |
| Ink | `#1f1600` | Text on gold |
| Buzzer red | dome gradient `#ffb8b8` → `#ff3030` → `#d40c0c` → `#7a0404` | The buzzer, lit. Darker red when unlit |
| `green` / `red` | Mantine | Correct / incorrect; `red.4` for negative scores |

The main action is gold, not `boardBlue`: a blue button disappears on the blue stage.

## Components

### Buzzer

One `Buzzer` in every view: an **oblong red dome** the full width of its container, set in a dark rim, with **no lettering**. The whole button is the tap target. Phones: 120 px tall, pinned to the bottom of every screen from the lobby on. Host column: 64 px. Pressing it sinks the dome into the rim.

| State | Looks | Screen-reader label |
|---|---|---|
| `idle` | Unlit dark red | Buzz |
| `dim` | Unlit, with a faint red ring around the rim | Buzz (get ready) |
| `lit` | Bright red, pulsing glow | Buzz |
| `early` | Dark red, shakes for the 250 ms lockout | Too early |
| `answering` | Green, glowing | Answer now |
| `locked` | Grey, faded, not pressable | You've answered this one |
| `pick` | Bright red, breathing slowly (the player in control, on the board) | Press and say your pick |
| `listening` | Green, glowing, while it listens for a spoken pick | Listening for your pick |

On the board, the controller's buzzer is how they say a pick: there's no separate microphone button. What a tap does in each state is in [gameplay](../features/gameplay/interaction-design.md#the-buzzer-one-component-everywhere).

### Player tile

Name and score, in join order, sharing the player column's height.

| Element | Treatment |
|---|---|
| Up to 4 players | Two lines (name, then score), at most 64 px |
| 5 or 6 players | One line (name, chip, score), at most 48 px |
| Player in control | 3 px `yellow.4` border, a soft gold glow, and a gold "PICKING" chip ("WAGERING" during their Daily Double wager) |
| Host who plays | Outlined "HOST" chip |
| Negative score | `red.4` |
| Disconnected | 45 % opacity, "(reconnecting)" after the name |
| Final | "wagering…" / "✓ locked", "writing…" / "✓ submitted", or "not in Final" (dimmed). Never an amount |
| Score change | The amount floats up over the tile for 1.8 s, green or red |

### Board

6 categories × 4 values. `boardBlue.9` cells with a bevel, values in `yellow.4` Oswald 700 with a dark drop shadow, no "$" on the board. Headers wrap to at most 3 lines and shrink to fit. A played cell is an empty cell. Pressed cells shrink slightly, and only when the board is tappable. Phones show the same board, compact (48 px rows).

### Stage

The left 72 % of every host screen: a rounded panel in the Stage gradient. Small uppercase line at the top ("VOLCANOES · $400", with a speaker icon while the narrator talks), the content as large as fits, and countdown bars along the bottom. While buzzing is open it gets a 3 px `yellow.4` border with a glow.

### Wager pad

Digits, backspace, **Min**, **Max**, and a gold confirm button that stays disabled until the amount is in range. The hint under the amount says the range, or why it's out of range ("At most $1,200").

- Phone: a single column, 54 px keys.
- Host device: on the **stage**, amount and confirm on the left, keys on the right. The player column has no room for it.
- Masked (the host's Final wager): digits show as dots, keys never highlight when pressed, and the hint says only "Out of range". The TV shows nothing but the number of digits.

### Blind keypad

The host's Final answer, on the stage under the clue: A to Z, space and backspace, keys that never highlight, a field that shows dots, and **Submit**. It replaces the iOS keyboard, which is mirrored to the TV and pops up each key as it's pressed.

### Sheets

Confirmations and reviews open as a sheet inside the screen: centered on the host device, sliding up from the bottom on phones (thumb reach). A tap outside closes it.

### Phone screen

A slim top bar ("ROOM K7RXM" on the left, my score in Oswald on the right), the content, and the buzzer pinned to the bottom. Big headlines are Oswald 600, 34 px ("Alice is picking…", "Listen…", "Look at the TV."). Moments are bigger and gold ("DAILY DOUBLE!", "BUZZ IN!").

## Host screen

Designed for an iPhone in landscape: 844 × 390 target, no scrolling from 667 × 320, inside the safe-area insets. Two columns on every game screen: the stage (about 72 %) and the player column (about 28 %, at least 180 px), with the host's buzzer at the bottom of the column when the host plays.

## Motion

| Moment | Motion |
|---|---|
| DAILY DOUBLE, "Double Schmegettes!", FINAL SCHMEGETTES, a wager amount, a verdict on the phone | Pops in (scale up past full size, settle), about 400 ms |
| New lobby player, reveal lines, scoreboard rows | Slide up and fade in |
| Score change | Amount floats over the tile |
| Buzzing open | Buzzer glow and stage border pulse |
| Early buzz | Buzzer shakes |

No sound in v1.
