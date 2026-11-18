# Hosting a Game: Interaction Design

## Screens

| Route | Device | Shows |
|---|---|---|
| `/` | any | **Host a game**, code field + **Join** (exists today) |
| `/host/{code}` | host device (TV) | Lobby: code, join URL, host name, contestants, **Join the game**, **Start** |
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

Laid out for an iPhone in landscape (844 × 390 target, no scrolling down to 667 × 320), the same two columns as the game screens ([gameplay](../gameplay/interaction-design.md)):

```text
┌───────────────────────────────────────────────────┬───────────────────┐
│  SCHMEGETTES                  Hosted by Wyatt  ✎  │  Players  3 / 6   │
│                                                   │  ● Wyatt HOST     │
│              Join at {site}/join                  │  ● Alice          │
│                                                   │  ◌ Bob (reconn…)  │
│                  K 7 R X M                        │ ┌───────────────┐ │
│        Seasons 20–40 · Fast timers                │ │ (red buzzer)  │ │ ◀ once the host
│  [ Leave the game ] 🔊 Kristin ⚙ Options [ Start ]│ └───────────────┘ │   joined
└───────────────────────────────────────────────────┴───────────────────┘
```

- The code is the biggest thing on screen (Oswald, readable at 3 m): each letter in gold on its own board-blue tile.
- **✎** next to the host name edits it until Start.
- A new player animates into the list, without a sound.
- **Start**: primary button. While there are no contestants it is disabled, with the hint "Need at least 1 player". A playing host counts.
- **Join the game** (secondary) adds the host to the list at once, under their host name, tagged HOST, and the button becomes **Leave the game**. Editing the host name with ✎ updates both places.
- **🔊 {voice name}** (subtle button) opens the narrator voice picker (below). While the chosen voice downloads it reads "🔊 Norman · 40%", and **Start** reads "Getting Norman ready… 40%" and is disabled.
- On a device that can't run the voices, the 🔊 button is hidden and a notice replaces the join URL line: "This device can't run the Schmegettes narrator. Host from a recent iPhone, iPad or computer." Start stays disabled.
- **⚙ Options** (subtle button) opens the game options sheet (below). The line under the code lists the options that aren't the default; it's empty with the defaults.

### Narrator voice picker (host device)

Rules: [gameplay](../gameplay/feature-brief.md#the-narrators-voice).

```text
┌──────────────────── Narrator voice ────────────────────┐
│  ✓ Kristin                                             │
│    Norman                           Downloading… 40%   │
│    John                                                │
│                                                        │
│                                             [ Done ]   │
└────────────────────────────────────────────────────────┘
```

1. The host taps **🔊 Kristin**. A modal lists the three Schmegettes voices, with the current one checked. The device's built-in voices aren't listed.
2. Tapping a row selects it at once and says "Here's a sample of my voice." on the TV once it's ready.
3. **Done** (or tapping outside the modal) closes it. The button shows the new name. The choice is saved on this device.

- Each row shows its state on the right: "Downloading… 40%", nothing once it's ready or before it's picked, or "Couldn't download" with **Try again**. Tapping a voice that isn't on the device selects it and starts its download (about 63 MB); its sample plays once it's ready, and Start waits for it.

### Game options (host device)

Rules: [lobby feature brief](./feature-brief.md#game-options).

```text
┌────────────────────── Game options ─────────────────────┐
│  Seasons        1984 ●━━━━━━━━━━━━━━━━━━━━━━━● 2024      │
│                 Seasons 1–40 (all)                      │
│                                                         │
│  Timers         ( Relaxed | Standard | Fast )           │
│                 9 s to buzz in, 9 s to answer           │
│                                                         │
│  Double         [■■ On ]  Two boards, then Final        │
│  Schmegettes                                            │
│                                             [ Done ]    │
└─────────────────────────────────────────────────────────┘
```

- **Seasons:** a two-handle range slider, ticks per season, labeled with years at the ends and the range as text below ("Seasons 20–40 · 2003–2024"). The handles can meet (one season) but not cross.
- **Timers:** a three-way segmented control. The line below spells out the choice ("15 s to buzz in, 12 s to answer").
- **Double Schmegettes:** a switch. The line beside it says "Two boards, then Final" or "One board, then Final".
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
2. "What's your name?" with the last name used prefilled, then **Join**.
3. "You're in, Alice." with the microphone prompt, **Edit name** and **Leave**, and the buzzer pinned to the bottom of the screen (dim; a tap only animates it). The buzzer stays there for the rest of the game ([gameplay](../gameplay/interaction-design.md)).
4. On Start everyone sees "Shuffling a fresh board…" ([game-history](../game-history/interaction-design.md)).

### Start (host device)

1. Host presses **Start** (2 or more contestants). The button shows a spinner, and joining closes immediately.
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
| Lobby, after **Join the game** | Buzzer `idle` (a tap only animates it) |
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
| Host joins when the room is full | **Join the game** is disabled: "Room is full" |
| Host leaves the game so the count drops below 2 | Start disables again |
| Host device disconnects mid-game while playing | Same as any contestant dropping: their buzzer is gone until reconnect. The game pauses only per the room rules. |
| Host overrides a verdict on their own answer | Allowed. The TV labels it "Host override". |
| A player edits their name in the lobby | The TV list updates live |
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
| Rematch | The room's options carry over; the host can change them before Start |
| Host presses Start while a player is mid-join | Whoever has finished joining when the server handles Start is in. The rest see "This game has already started." |
| A player leaves so the count drops below 2 | Start disables again |
| Host presses Host a game again on Home while their lobby is open | The old lobby closes ("This room has closed" on its phones) and a new code appears |
| Room creation fails | Back to Home with "Couldn't create a room. Try again." |
