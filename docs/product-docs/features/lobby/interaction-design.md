# Hosting a Game: Interaction Design

## Screens

| Route | Device | Shows |
|---|---|---|
| `/` | any | **Host a game**, code field + **Join** (exists today) |
| `/host/{code}` | host device (TV) | Lobby: code, join URL, host name, contestants (folded away until opened), **Join**, **Start** |
| `/join/{code}` | phone | Name entry, then "You're in" |

## States of a room (lobby part)

```text
Host a game ─▶ name ─▶ creating ─▶ lobby ──Start──▶ building_board ─▶ (gameplay)
                          │          │
                          │          └─ host gone 30 min / new room by same host ─▶ closed
                          └─ fails ─▶ Home with "Couldn't create a room. Try again."
```

## Flows

### Host a game (host device)

1. Host presses **Host a game**.
2. A modal asks "What's your name?", prefilled with the last name used, then **Create room**. The button shows a spinner and can't be pressed again.
3. The room is created (target under 1 s) and the browser goes to `/host/K7RXM`.
4. The lobby shows the code at once. The contestant list starts empty: "Waiting for players…"

### Lobby (TV view)

Laid out for an iPhone in landscape (844 × 390 target, no scrolling down to 667 × 320). Unlike the game screens, the lobby gives the stage the full width: the player list is **folded away** into a slim tab on the right edge.

**Folded (every time the lobby opens):**

```text
┌──────────────────────────────────────────────────────────────────┬───┐
│  SCHMEGETTES                               Hosted by Wyatt  ✎    │ P │
│                                                                  │ l │
│                     Join at {site}/join                          │ a │
│                                                                  │ y │
│                         K 7 R X M                                │ e │
│               Seasons 20–40 · No Double Schmegettes              │ r │
│  [ Join ]                                    🔊  ⚙   [ Start ]  │ s │
│                                                                  │3/6│
└──────────────────────────────────────────────────────────────────┴───┘
```

**Open (after a tap on the tab):**

```text
┌───────────────────────────────────────────────────┬───────────────────┐
│  SCHMEGETTES                  Hosted by Wyatt  ✎  │  Players  3 / 6 › │
│                                                   │  ● Wyatt HOST     │
│              Join at {site}/join                  │  ● Alice          │
│                                                   │  ◌ Bob (reconn…)  │
│                  K 7 R X M                        │                   │
│      Seasons 20–40 · No Double Schmegettes        │                   │
│  [ Leave ]                     🔊  ⚙   [ Start ]  │                   │
└───────────────────────────────────────────────────┴───────────────────┘
```

- The code is the biggest thing on screen (Oswald, readable at 3 m): each letter in gold on its own board-blue tile. Folded, the code has the stage's full width.
- **Players tab.** Folded, the right edge shows a tab about 40 px wide with "Players" and the count ("3/6"). A tap anywhere on it opens the column (about 28% of the width, as in the game) with the list. **›** in the column's header, or a tap on the header, folds it again. The lobby always opens folded: on Home → Host a game, on a reload, and on a rematch. The choice isn't remembered.
- **A new player** animates into the list when it's open, without a sound. Folded, the count changes and the tab flashes gold once (0.6 s), so the host notices without opening it. With reduced motion turned on, the count just changes.
- **No buzzer in the lobby on the host device.** The host's buzzer appears in the player column at Start, when the column comes back for the game. Phones keep their dim lobby buzzer.
- **✎** next to the host name edits it until Start.
- **Start**: primary button. It is disabled while nobody has joined, with no hint text. A playing host counts.
- **Join** (secondary) adds the host to the list at once, under their host name, tagged HOST, and the button becomes **Leave**. Editing the host name with ✎ updates both places. Joining doesn't open the column.
- **🔊** (icon button, no text) opens the narrator voice picker (below). Its accessible name and hover tooltip are "Narrator voice: Norman". While the chosen voice downloads, a progress ring fills around the icon, and **Start** reads "Getting Kristin ready… 40%" and is disabled.
- On a device that can't run the voices, the 🔊 button is hidden and a notice replaces the join URL line: "This device can't run the Schmegettes narrator. Host from a recent iPhone, iPad or computer." Start stays disabled.
- **⚙** (icon button, no text; accessible name and tooltip "Game options") opens the game options sheet (below). The line under the code lists the options that aren't the default; it's empty with the defaults.
- Both icon buttons are at least 44 × 44 px to tap.

### Narrator voice picker (host device)

Rules: [gameplay](../gameplay/feature-brief.md#the-narrators-voice).

```text
┌──────────────────── Narrator voice ────────────────────┐
│  ✓ Norman                                              │
│    Kristin                          Downloading… 40%   │
│    John                                                │
│                                                        │
│                                             [ Done ]   │
└────────────────────────────────────────────────────────┘
```

1. The host taps **🔊**. A modal lists the three Schmegettes voices (Norman, the default, first), with the current one checked. The device's built-in voices aren't listed.
2. Tapping a row selects it at once and says "Here's a sample of my voice." on the TV once it's ready.
3. **Done** (or tapping outside the modal) closes it. The button's accessible name and tooltip give the new voice. The choice is saved on this device.

- Each row shows its state on the right: "Downloading… 40%", nothing once it's ready or before it's picked, or "Couldn't download" with **Try again**. Tapping a voice that isn't on the device selects it and starts its download (about 63 MB); its sample plays once it's ready, and Start waits for it.

### Game options (host device)

Rules: [lobby feature brief](./feature-brief.md#game-options).

```text
┌────────────────────── Game options ─────────────────────┐
│  Seasons        1984 ●━━━━━━━━━━━━━━━━━━━━━━━● 2024      │
│                 Seasons 1–40 (all)                      │
│  Difficulty     ( Easy | Medium | Hard )                │
│                 A mix most groups will enjoy            │
│  Double         [■■ On ]  Two boards, then Final        │
│  Schmegettes                                            │
│                                                         │
│  Quick picks    [ Off□□]  Say the category and amount   │
│                                             [ Done ]    │
└─────────────────────────────────────────────────────────┘
```

- **Seasons:** a two-handle range slider, ticks per season, labeled with years at the ends and the range as text below ("Seasons 20–40 · 2003–2024"). The handles can meet (one season) but not cross.
- **Difficulty:** a three-way segmented control, Medium selected by default. The line below describes the choice: "Clues most people know" (Easy), "A mix most groups will enjoy" (Medium), "For trivia regulars" (Hard). The line under the code says "Easy" or "Hard"; Medium, the default, isn't listed.
- **Double Schmegettes:** a switch. The line beside it says "Two boards, then Final" or "One board, then Final".
- **Quick picks:** a switch, off by default. The line beside it says "Say the category and amount" (off) or "Just the category picks its lowest clue" (on).
- Changes apply as they're made; **Done** or a tap outside closes the sheet. The line under the code updates live.
- Laid out for 844 × 390 without scrolling, like every host screen.

### Home Screen tip (iPhone and iPad Safari only)

```text
┌───────────────────────────────────────────────────┐
│ ⤴ For full screen, add Schmegettes to your Home   │ ✕
│   Screen: tap Share, then Add to Home Screen.     │
└───────────────────────────────────────────────────┘
```

A slim banner across the top of the host lobby's stage, above the title. ✕ hides it for good on that device. It doesn't push the code off screen at 667 × 320.

### Join (phone)

1. Player enters the code on Home → `/join/K7RXM`.
2. The microphone screen: **Allow microphone**. The player can't go on until it's allowed ([gameplay](../gameplay/interaction-design.md#microphone-permission)).
3. "What's your name?" with the last name used prefilled, then **Join**.
4. "You're in, Alice." with **Edit name** and **Leave**, and the buzzer pinned to the bottom of the screen (dim; a tap only animates it). The buzzer stays there for the rest of the game ([gameplay](../gameplay/interaction-design.md)).
5. On Start everyone sees "Shuffling a fresh board…" ([game-history](../game-history/interaction-design.md)).

### Start (host device)

1. Host presses **Start** (1 or more contestants). The button shows a spinner, and joining closes immediately.
2. TV and phones go to `building_board`.

### Playing on the host device (in game)

When the host joined, their controls live in the **player column** on the right of the host screen (iPhone landscape): the host's tile among the others, and the shared `Buzzer` at the bottom of the column. It's visible to the room and only ever shows the host's own controls. It follows the same rules as a phone ([gameplay](../gameplay/interaction-design.md)):

```text
┌───────────────────────────────────────────────────┬───────────────────┐
│                                                   │ ┏━━━━━━━━━━━━━━━┓ │
│               (board / clue)                      │ ┃ Alice  $1,200 ┃ │
│                                                   │ ┗━━━━━━━━━━━━━━━┛ │
│                                                   │  Wyatt HOST −$200 │
│                                                   │ ┌───────────────┐ │
│                                                   │ │ (red buzzer)  │ │ ◀ space bar too
└───────────────────────────────────────────────────┴───────────────────┘
```

| Phase | Player column |
|---|---|
| Lobby, after **Join** | No buzzer: the host's buzzer appears in the column at Start |
| `board`, host has control | Host's tile highlighted, buzzer in `pick`. Tap the board and confirm, or press the buzzer and say it |
| `board`, someone else has control | Board taps do nothing |
| `clue_reading` | **Buzz** dimmed. Pressing it early gives the same lockout as on a phone. |
| `buzzing_open` | **Buzz** lit |
| `answering`, host buzzed | Buzzer turns green; mic level meter under the clue |
| `daily_double_wager` (host's) | Number pad on the **stage** (the column has no room for it) |
| `final_wager` | Masked number pad on the stage, `$ •••••`. The tile shows "wagering…" |
| `final_answer` | Blind keypad on the stage, masked field `•••••` and **Submit**. The answer is never shown. |

## Edge cases

| Situation | Behavior |
|---|---|
| Empty or whitespace-only name | **Create room** / **Join** stay disabled |
| Name longer than 20 | Input stops at 20 characters |
| Wrong or unknown code | Phone: "No room with that code." Stays on the code field. |
| Room full | Phone: "This room is full (6/6)." |
| Join after Start | Phone: "This game has already started." |
| Room closed | Phone: "This room has closed." with a link Home |
| Duplicate contestant name | Shown as "Alice 2" |
| Host joins and a contestant has the same name | The later of the two gets the suffix ("Wyatt 2") |
| Host presses Join and blocks the microphone | Not added. The microphone screen shows the steps and **Try again**; **Cancel** returns to the lobby as a non-playing host |
| Host joins when the room is full | **Join** is disabled: "Room is full" |
| Host leaves the game and nobody else has joined | Start disables again |
| Host device disconnects mid-game while playing | Same as any contestant dropping: their buzzer is gone until reconnect. The game pauses only per the room rules. |
| Host overrides a verdict on their own answer | Allowed. The TV labels it "Host override". |
| A player edits their name in the lobby | The TV list updates live |
| A player joins or leaves while the player list is folded | The tab's count updates; a join flashes the tab once |
| A player reconnects or drops while the list is folded | Nothing on the tab changes; open the list to see "(reconnecting)" |
| The host taps 🔊 or ⚙ with a screen reader | The buttons are announced as "Narrator voice: Norman" and "Game options" |
| Quick picks on, and the controller says "Opera" with Opera 200 done and 400, 600, 800 left | Opera 400 is picked at once, with no confirmation |
| A device saved Relaxed or Fast timers from before | Ignored: every game uses the standard times ([game options](./feature-brief.md#game-options)) |
| Host reloads the TV | Returns to the same lobby with the same players and host name |
| Host opens `/host/{code}` on a second device | That device is the same account only if it's the same browser session. Otherwise "Only the host can open this screen" and a link to join |
| Player reloads | Rejoins as the same player, with no name prompt |
| Player disconnects | Stays listed, dimmed "(reconnecting)". Start still counts them. |
| Two Start presses (double tap) | Only the first counts. The second does nothing. |
| Host taps a second voice while a sample is playing | The first sample stops; the new one plays |
| Host presses Start while a sample is playing, or the picker is open | The sample stops and the picker closes. The selected voice is kept |
| The sample is blocked because sound isn't unlocked yet (iOS) | Tapping a row counts as the unlocking tap, so the sample plays |
| The voice is still downloading when everyone's in | Start stays disabled and shows the progress; it enables the moment the voice is ready |
| The download fails (offline, blocked, out of space) | The row and Start say "Couldn't download the voice" with **Try again**. Start stays disabled. The next lobby tries again on its own |
| The browser deleted the saved voice (iOS clears site data that hasn't been used for a few weeks) | It downloads again in the background when the lobby opens |
| The device can't generate speech fast enough | The device can't host: the lobby shows the notice and Start stays disabled |
| Host picks Norman, then John, before either finishes downloading | Norman's download stops; John's starts. Only the voice that ends up picked is kept |
| Host picks another voice and its download fails | The row says "Couldn't download" with **Try again**. Start stays disabled until it downloads, or until the host picks back the voice already on the device |
| Host switches from Norman back to Kristin after Norman replaced it | Kristin downloads again (about 63 MB); Start waits for it |
| Host opens the lobby from the Home Screen app for the first time | Signs in or redeems a host code there, and the voice downloads there; iOS keeps the app's storage apart from Safari's |
| Host changes the options, then a player joins | Nothing changes for the player; options are shown only on the TV |
| Host picks a one-season range | Allowed. The board falls back to least-recently-seen categories if fresh ones run out |
| Host picks Hard with a one-season range | Allowed. Fresh Hard categories first, then fresh Medium ones, then the least-recently-seen at any level |
| A device or room saved options before Difficulty existed | Opens with Medium |
| Host resumes an abandoned game | Its boards were built at Start; the difficulty it started with stands |
| Rematch | The room's options carry over; the host can change them before Start |
| Host presses Start while a player is mid-join | Whoever has finished joining when the server handles Start is in. The rest see "This game has already started." |
| The last player leaves | Start disables again |
| Host presses Host a game again on Home while their lobby is open | The old lobby closes ("This room has closed" on its phones) and a new code appears |
| Room creation fails | Back to Home with "Couldn't create a room. Try again." |
