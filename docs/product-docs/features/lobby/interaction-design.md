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
│                                                   │ │ (red buzzer)  │ │ ◀ once the host
│  [ Leave the game ]   🔊 Ava        [   Start   ] │ └───────────────┘ │   joined
└───────────────────────────────────────────────────┴───────────────────┘
```

- The code is the biggest thing on screen (Oswald, readable at 3 m): each letter in gold on its own board-blue tile.
- **✎** next to the host name edits it until Start.
- A new player animates into the list, without a sound.
- **Start**: primary button. While there are fewer than 2 contestants it is disabled, with the hint "Need at least 2 players". A playing host counts.
- **Join the game** (secondary) adds the host to the list at once, under their host name, tagged HOST, and the button becomes **Leave the game**. Editing the host name with ✎ updates both places.
- **🔊 {voice name}** (subtle button) opens the narrator voice picker (below). While the chosen Schmegettes voice downloads it reads "🔊 Norman · 40%". It's hidden when the device can't speak at all.

### Narrator voice picker (host device)

Rules: [gameplay](../gameplay/feature-brief.md#the-narrators-voice).

```text
┌──────────────────── Narrator voice ────────────────────┐
│  ──────────── Schmegettes voices ────────────────────  │ ◀ always first
│  ✓ Kristin                                             │
│    Norman                           Downloading… 40%   │
│    John                                                │
│  ──────────── Voices on this device ─────────────────  │
│    Ava (Premium)                                       │
│    Samantha                                            │
│    Daniel (UK)                                         │ ◀ list scrolls
│  ──────────────────────────────────────────────────── │
│  Want a more natural voice? Download a Premium voice   │ ◀ only when the Schmegettes
│  in Settings → Accessibility → Spoken Content →        │   voice can't be used and no
│  Voices → English, then reload this page.              │   Premium or Enhanced voice
│                                                        │   is installed
│                                             [ Done ]   │
└────────────────────────────────────────────────────────┘
```

1. The host taps **🔊 Kristin**. A modal lists the Schmegettes voices first (Kristin, Norman, John), then the device's English voices, best first, with the current one checked. Each device voice shows its name, its quality ("Premium", "Enhanced"), and the region when it isn't US ("UK", "Australia").
2. Tapping a row selects it at once and says "Here's Volcanoes for 400." in that voice on the TV.
3. **Done** (or tapping outside the modal) closes it. The button shows the new name. The choice is saved on this device.

- The settings path in the tip matches the device: iPhone/iPad, or Mac (System Settings). Other devices don't show a tip.
- Novelty voices (singing, whispering, robot effects) aren't listed.
- Each Schmegettes voice row shows its state on the right: "Downloading… 40%", nothing once it's ready or before it's picked, or "Couldn't download" with **Try again**. Tapping a voice that isn't on the device selects it and starts its download (about 63 MB); its sample plays once it's ready. Until then the narrator keeps the voice it had: the previous Schmegettes voice if one is on the device, else the best built-in voice.

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
| Voice list not loaded yet when the lobby opens (browsers load it late) | The button reads "🔊 Default voice" and switches to the chosen voice's name when the list arrives. The picker says "Loading voices…" until then |
| Host taps a second voice while a sample is playing | The first sample stops; the new one plays |
| Host presses Start while a sample is playing, or the picker is open | The sample stops and the picker closes. The selected voice is kept |
| Device has no English voice | The device's default voice reads. The picker says "No English voices on this device." with the tip |
| The sample is blocked because sound isn't unlocked yet (iOS) | Tapping a row counts as the unlocking tap, so the sample plays |
| The Schmegettes voice is still downloading at Start | Start works as usual. The narrator uses the best built-in voice and switches to the Schmegettes voice at the next line once it's ready |
| The download fails (offline, blocked, out of space) | The row says "Couldn't download" with **Try again**. The best built-in voice reads. The next lobby tries again on its own |
| The browser deleted the saved voice (iOS clears site data that hasn't been used for a few weeks) | It downloads again in the background when the lobby opens |
| The device can't generate speech fast enough | The Schmegettes voice rows say "Not available on this device". The built-in voices and the tip are shown |
| Host picks Norman, then John, before either finishes downloading | Norman's download stops; John's starts. Only the voice that ends up picked is kept |
| Host picks another Schmegettes voice and its download fails | The row says "Couldn't download" with **Try again**. The narrator keeps the voice already on the device |
| Host switches from Norman back to Kristin after Norman replaced it | Kristin downloads again (about 63 MB); Norman keeps reading until it's ready |
| Host presses Start while a player is mid-join | Whoever has finished joining when the server handles Start is in. The rest see "This game has already started." |
| A player leaves so the count drops below 2 | Start disables again |
| Host presses Host a game again on Home while their lobby is open | The old lobby closes ("This room has closed" on its phones) and a new code appears |
| Room creation fails | Back to Home with "Couldn't create a room. Try again." |
