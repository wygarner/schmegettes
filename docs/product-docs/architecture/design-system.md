# Design System

One component library for product UI and prototypes: **Mantine 9**. Prototypes in `devtools/src/designs/` and production code in `web/` use the same theme values, so a prototype looks like the real thing.

> Status: the look below is built in `web/` (`web/src/ui/`, `web/src/game/`). So are the end-of-game scoreboard, host overrides, and My games ([game history](../features/game-history/interaction-design.md)). The reference prototypes are [system/components](../../../devtools/src/designs/system/components.tsx) (the kit, with a fit check for the host screen), [lobby/host-and-join](../../../devtools/src/designs/lobby/host-and-join.tsx), [board/clue-loop](../../../devtools/src/designs/board/clue-loop.tsx), [final/final-schmegettes](../../../devtools/src/designs/final/final-schmegettes.tsx) and [results/scoreboard-and-history](../../../devtools/src/designs/results/scoreboard-and-history.tsx). Run `mise run dev:devtools` to see them.
>
> The [menu screens](#menu-screens) look (Home, My games, Account and their sheets) is built in `web/src/ui/menu.tsx`, with its tokens in `web/src/ui/tokens.ts` and motion in `web/src/ui/kit.css`. Its reference prototype is [system/menus-and-type](../../../devtools/src/designs/system/menus-and-type.tsx), with Oswald + Inter selected.

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
| Menu screens: large titles, sheet titles, the primary button | Oswald 700, uppercase |
| Everything else | Inter |

Numbers in lists and stats use tabular figures, so scores line up.

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
| `SOFT` (`pink.2`) | `#ffa6d9`, Corinthian pink | Labels and small uppercase eyebrows on mauve. On the menu screens, pink is for labels only, not body text |
| `QUIET` | `#b8a8d8`, cool lavender | Secondary body text on the menu screens: subtitles, sheet descriptions, info-box text |
| `FAINT` | `#8a7aad` | Captions, hints under fields, chevrons, group dividers' labels on the menu screens |
| `MUTED` / `DIM` | `#d6a3c8` / `#9a7aad` | Quieter text (dates, hints) / placeholders and "listening…" |
| `GREEN` (`teal.4`) / `RED` (`red.4`) | Mantine | Correct / incorrect, and negative scores. Correct uses teal, not the accent green, so right and wrong still read at a glance |
| Buzzer red | dome gradient `#ffb8b8` → `#ff3030` → `#d40c0c` → `#7a0404` | The buzzer, lit. It stays red: it's the one thing that should look like a button to hit |

## App icon

The wordmark's **S** (Oswald 700, converted to a path so no font is needed) in the wordmark's vertical green gradient, with its dark drop shadow and a soft green glow, on the `STAGE_BG` gradient. Files in `web/public/`:

| File | Use | Shape |
|---|---|---|
| `favicon.svg` | Browser tab (the source of the design) | Rounded square, S a little larger so it reads at 16 px |
| `favicon.ico` | Tab fallback (32 px) | Same as `favicon.svg` |
| `apple-touch-icon.png` | iOS home screen (180 px) | Full-bleed square; iOS rounds the corners |
| `icon-192.png`, `icon-512.png` | Manifest, `purpose: any` | Full-bleed square |
| `icon-maskable-512.png` | Manifest, `purpose: maskable` (Android) | Full-bleed, S smaller to stay inside the 80 % safe circle |

The PNGs are rendered from the SVG design. To change the icon, edit `favicon.svg` and re-render the PNGs and ICO from it at the sizes above.

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

5 categories × 4 values, sharing the stage's width. `mauve.9` cells with a bevel, values in the accent (`green.4`) Oswald 700 with a dark drop shadow, no "$" on the board. Headers wrap to at most 3 lines and shrink to fit. A played cell is an empty cell. Pressed cells shrink slightly, and only when the board is tappable. Phones show the same board, compact (48 px rows).

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

## Menu screens

Home, My games, Account and the sheets they open. Calmer than the game screens: one green button per screen, quiet surfaces, native-feeling lists. Game screens keep the look above.

### Background and surfaces

| Element | Treatment |
|---|---|
| Background | `NIGHT` base with a light-mauve glow at the top center and a faint pink glow top right, plus a light film grain (stops gradient banding on phones) |
| Surface | Cards and grouped lists: a white tint from 7 % at the top to 3.5 % at the bottom, a 1 px hairline (`rgba(255,255,255,.08)`), a faint lit top edge, and a soft drop shadow. Radius 22–28 px |
| Dividers | 1 px hairlines inside a surface, never gaps between floating boxes |

### Headers

- **Large title**: Oswald 700, uppercase, about 38 px, top left, with an optional pink eyebrow above (12 px, 700, uppercase, `.14em` tracking) and a `QUIET` subtitle below.
- **Top bar**: a back link ("‹ Home") on the left. Once the large title scrolls away, the bar frosts (blur, dark mauve at 72 %, hairline under it) and shows the title small in the center.
- **Home control** off the menu screens (join, lobby, game, a game's scoreboard): `HomeButton`, a 44 × 44 house icon in `QUIET` with no fill, tooltip "Home". During a game it opens a "Leave the game?" sheet first ([navigation](../features/navigation/interaction-design.md)).
- **Section labels** above grouped lists: the eyebrow style in `QUIET` ("NOVEMBER 2026", "SECURITY").
- Headings and short copy use balanced wrapping; paragraphs avoid single-word last lines.

### Buttons

All pills (fully rounded). Pressing scales to 97 %. Focus shows a 2 px accent outline.

| Kind | Looks | Use |
|---|---|---|
| Primary | Accent gradient (`green.2` → `green.4` → `green.5`), `INK` text, a lit top edge and a soft green shadow. Oswald 700 uppercase, `.08em` tracking | The one main action on a screen (Join, Create room, Save) |
| Secondary | Light mauve at 20 % with a mauve hairline, light text, Inter 650 | Sign in, Try again, actions inside info boxes |
| Ghost | No fill, light mauve text | Cancel, Show more, "I have an account" |
| Danger | Red tint with a red hairline | Destructive actions shown inline |
| Danger solid | Red gradient, white text | The confirm button of an irreversible sheet (Delete account) |
| Icon | 36 px circle, white at 8 % | Close (✕) on sheets, edit |

Sizes: 56 px (full-width form actions), 46 px, 36 px. Loading replaces the label with a spinner and keeps the width; disabled is a flat white-at-6 % pill with faded text.

### Forms

- Label above the field (14 px, 600). A counter on the right of the label where there's a limit ("5/20").
- Fields are 54 px tall, 16 px radius, white at 5 % with a 12 % hairline, optional leading icon. Focus: accent border plus a 4 px soft green ring.
- Hint under the field in `FAINT`. An error replaces the hint, in `RED` with a warning icon; the field gets a red border and shakes once.
- Passwords have a show/hide eye in the field. New passwords get a four-segment length meter ("3 more characters", Good, Strong, Very strong).
- **Room code**: five separate 64 px boxes over one real input (pasting fills all five, Enter joins). The current box has an accent border and a blinking caret; filled boxes get a green tint.
- One full-width primary button per form, at the bottom.

### Informational text

- **Info box**: tinted surface (18 px radius), a matching hairline, and a round icon chip on the left; optional title (15 px, 650, white), text in `QUIET`, an optional small secondary button, and an optional ✕. Tones: info (mauve), success (teal), warning (amber), error (red). Never a full-strength color block.
- **Hint**: one line with a small icon in front, for notes under a button or field.
- **Chips**: 20 px pills, 11 px bold, tinted fill and hairline in their color: accent, neutral, amber ("Unfinished").
- **Empty and error states**: a tilted 88 px icon tile with a soft glow in its color, a headline (Oswald), a `QUIET` line, and one button.
- **Toast**: frosted pill at the top with a teal check.

### Grouped rows

Settings-style rows inside one surface, divided by hairlines: a 34 px tinted icon tile, title (16 px, 550), optional `FAINT` subtitle, value in `QUIET` on the right, and a chevron when tappable. Destructive rows are red and sit in their own group at the bottom.

### Sheets

Every menu sheet and confirmation slides up from the bottom: 32 px top corners, a grab handle, the title in Oswald with a ✕ on the right, a `QUIET` description, then the form. Confirmations center an icon tile, title and text, with the action and **Cancel** (ghost) stacked full width. The backdrop is dark with a light blur. Tapping outside or Escape closes it.

### Loading

Skeletons in the shape of the content, with a slow shimmer, instead of a spinner.

### Home

```text
┌────────────────────────────────────┐
│                         [Sign in]  │  ◀ or the avatar (initial in a
│            SCHMEGETTES             │     green-mauve-pink ring) → Account
│  The quiz show for your living room│
│ ┌────────────────────────────────┐ │
│ │ JOIN A GAME                    │ │
│ │ Enter the code on the TV       │ │
│ │ [K][7][R][ ][ ]                │ │
│ │ [          JOIN  →           ] │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ ▣ Host a game                › │ │
│ │   On the device you'll put on  │ │
│ │   the TV                       │ │
│ │ ▣ My games                   › │ │
│ │   Last: Today · −$400          │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

- The wordmark is Oswald 700 with a vertical green gradient, a dark drop shadow and a faint green glow.
- "You've been signed out" is a warning info box above the Join card.
- **Host a game** shows a spinner in place of its chevron while host access is checked.
- An admin (only) sees one more row after Stats: **Admin** · "Host code", opening `/admin` ([private access](../features/private-access/interaction-design.md#admin-screen-in-the-app-admin)).

Layouts for [My games](../features/game-history/interaction-design.md#look-back-at-past-games-any-player) and the [Account page](../features/accounts/interaction-design.md#account-page-account) are in their specs.

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
