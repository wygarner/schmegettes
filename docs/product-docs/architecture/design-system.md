# Design System

One component library for product UI and prototypes: **Mantine 9**. Prototypes in `devtools/src/designs/` and production code in `web/` use the same theme values, so a prototype looks like the real thing.

> Status: the look below is built in `web/` (`web/src/ui/`, `web/src/game/`). So are the end-of-game scoreboard, host overrides, and My games ([game history](../features/game-history/interaction-design.md)). The reference prototypes are [system/components](../../../devtools/src/designs/system/components.tsx) (the kit, with a fit check for the host screen), [lobby/host-and-join](../../../devtools/src/designs/lobby/host-and-join.tsx), [board/clue-loop](../../../devtools/src/designs/board/clue-loop.tsx), [final/final-schmegettes](../../../devtools/src/designs/final/final-schmegettes.tsx) and [results/scoreboard-and-history](../../../devtools/src/designs/results/scoreboard-and-history.tsx). Run `mise run dev:devtools` to see them.

## Theme

```ts
{
  primaryColor: "green",
  primaryShade: 4,
  autoContrast: true,
  colors: {
    mauve: ["#f3edfe", "#e2d6fc", "#c9b3f9", "#ad8cf6", "#9161f2", "#7a48e0", "#6436c4", "#4e2a9c", "#3b2075", "#2a1754"],
    green: ["#eafff4", "#cfffe6", "#a6ffd2", "#8affc3", "#6bffb3", "#4ff09e", "#36d986", "#25bd6f", "#18a05c", "#0e8049"],
    pink:  ["#fff0f8", "#ffd9ef", "#ffa6d9", "#ff8fce", "#ff78c3", "#f25eb2", "#d9479b", "#bd3383", "#9e226c", "#801655"],
    dark:  ["#d6cfe6", "#bbb0d4", "#9f92bf", "#75679a", "#524478", "#3c3060", "#2e244d", "#241c3e", "#1b1433", "#140b2b"],
  },
  fontFamily: "Inter, system-ui, sans-serif",
  headings: { fontFamily: "Oswald, Impact, sans-serif" },
}
```

Default color scheme: dark. The palette is three colors: **light mauve `#9161F2`** (`mauve.4`), **Venice green `#6BFFB3`** (`green.4`), and **Corinthian pink `#FFA6D9`** (`pink.2`). Backgrounds use the deep end of the mauve scale, built around the light mauve, so white text and the green accent stay readable; the light mauve itself shows in the stage's top glow and border. Mantine's `dark` scale is mauve too, so inputs and dialogs match. `/product` and `/designer` refine this file; `web/src/main.tsx` is the source of truth for the values.

## Fonts

The app loads **Oswald** (500, 600, 700) and **Inter** (400 to 800), latin subset, **self-hosted**: the `@fontsource/oswald` and `@fontsource/inter` packages are bundled by Vite and served from the app's own origin (`web/src/main.tsx`). Nothing loads from a font CDN.

| Use | Font |
|---|---|
| Room code, board values, scores, wagers, big moments (DAILY DOUBLE, FINAL SCHMEGETTES), headlines on phones | Oswald 700, values and scores 600 |
| Clue text and correct responses | Oswald 500, uppercase. Condensed, so a long clue fits the 667 × 320 host screen |
| Category headers | Inter 700, uppercase |
| Everything else | Inter |

Board values are Oswald 700. Oswald has no 800 weight.

## Color

| Token (`web/src/ui/tokens.ts`) | Value | Use |
|---|---|---|
| `NIGHT` | `#140b2b` (darkest mauve) | Host screen behind the stage and board; base of the phone background |
| `STAGE_BG` | radial gradient `#5a36b4` → `#2a1754` → `#1a0f38`, lighter at the top, with a light-mauve border | The panel behind clues, the lobby, Daily Double, Final, and the scoreboard |
| `PHONE_BG` | `#4a2b94` at the top, fading to `NIGHT` | Every phone screen |
| `CELL` (`mauve.9`) | `#2a1754` | Board cells and category headers, with a bevel (light top edge, dark bottom edge) |
| `TILE_BG` | deep mauve gradient, slightly lighter at the top | Player tiles, lobby rows |
| `ACCENT` (`green.4`) | `#6bffb3`, Venice green | Values, scores, the control ring, the stage's lit border, **the main action** (Start, Pick, Wager, Lock in, Submit, Rematch), "BUZZ IN!" |
| `INK` | `#140b2b` | Text on the accent |
| `SOFT` (`pink.2`) | `#ffa6d9`, Corinthian pink | Secondary text and labels on mauve |
| `MUTED` / `DIM` | `#d6a3c8` / `#9a7aad` | Quieter text (dates, hints) / placeholders and "listening…" |
| `GREEN` (`teal.4`) / `RED` (`red.4`) | Mantine | Correct / incorrect, and negative scores. Correct uses teal, not the accent green, so right and wrong still read at a glance |
| Buzzer red | dome gradient `#ffb8b8` → `#ff3030` → `#d40c0c` → `#7a0404` | The buzzer, lit. It stays red: it's the one thing that should look like a button to hit |

## Components

### Buzzer

One `Buzzer` in every view: an **oblong red dome** the full width of its container, set in a dark rim, with **no lettering**. The whole button is the tap target. Phones: 120 px tall, pinned to the bottom of every screen from the lobby on. Host column: 64 px. Pressing it sinks the dome into the rim.

The button's accessible name is always **Buzz**; screen readers hear the state as its description.

| State | Looks | Screen-reader description |
|---|---|---|
| `idle` | Unlit dark red | Not now |
| `dim` | Unlit, with a faint red ring around the rim | Get ready |
| `lit` | Bright red, pulsing glow | Buzz now |
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
| Player in control | 3 px accent (`green.4`) border, a soft green glow, and a green "PICKING" chip ("WAGERING" during their Daily Double wager) |
| Host who plays | Outlined "HOST" chip |
| Negative score | `red.4` |
| Disconnected | 45 % opacity, "(reconnecting)" after the name |
| Final | "wagering…" / "✓ locked", "writing…" / "✓ submitted", or "not in Final" (dimmed). Never an amount |
| Score change | The amount floats up over the tile for 1.8 s, green or red |

### Board

6 categories × 4 values. `mauve.9` cells with a bevel, values in the accent (`green.4`) Oswald 700 with a dark drop shadow, no "$" on the board. Headers wrap to at most 3 lines and shrink to fit. A played cell is an empty cell. Pressed cells shrink slightly, and only when the board is tappable. Phones show the same board, compact (48 px rows).

### Stage

The left 72 % of every host screen: a rounded panel in the Stage gradient. Small uppercase line at the top ("VOLCANOES · $400", with a speaker icon while the narrator talks), the content as large as fits, and countdown bars along the bottom. While buzzing is open it gets a 3 px accent (`green.4`) border with a glow.

### Wager pad

Digits, backspace, **Min**, **Max**, and a green (accent) confirm button that stays disabled until the amount is in range. The hint under the amount says the range, or why it's out of range ("At most $1,200").

- Phone: a single column, 54 px keys.
- Host device: on the **stage**, amount and confirm on the left, keys on the right. The player column has no room for it.
- Masked (the host's Final wager): the amount shows as a fixed `$ •••••` (not one dot per digit), keys never highlight when pressed, and the hint says only "Out of range". The TV shows nothing about the amount, not even its length.

### Blind keypad

The host's Final answer, on the stage under the clue: A to Z, space and backspace, keys that never highlight, a field that shows dots, and **Submit**. It replaces the iOS keyboard, which is mirrored to the TV and pops up each key as it's pressed.

### Sheets

Confirmations and reviews open as a sheet inside the screen: centered on the host device, sliding up from the bottom on phones (thumb reach). A tap outside closes it.

### Phone screen

A slim top bar ("ROOM K7RXM" on the left, my score in Oswald on the right), the content, and the buzzer pinned to the bottom. Big headlines are Oswald 600, 34 px ("Alice is picking…", "Listen…", "Look at the TV."). Moments are bigger and in the accent green ("DAILY DOUBLE!", "BUZZ IN!").

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
