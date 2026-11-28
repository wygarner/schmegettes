# Hosting a Game: Room and Lobby

## Why

Every game starts with one person pressing **Host a game** on the device that will drive the TV. The host gives their name, and a room is created. The TV then works as the lobby. It shows the code big enough to read from the couch, shows each player by name the moment they join, lets the host join the game themselves, and has **Start** when everyone is in.

## Jobs to be done

| Who | Job |
|---|---|
| Host | "I tap one button, say who I am, and get a code I can put up on the TV." |
| Host | "I can see who has joined, by name, so I know when everyone's in." |
| Host | "Someone typed a silly or rude name. I fix it from the TV before we start." |
| Contestant | "I point my camera at the TV and I'm on the join screen for this room, no typing." |
| Host | "I want to play too, on the same device, without a second phone." |
| Host | "When we're ready, I start the game with one press." |
| Contestant | "I type the code from the TV, enter my name, and see myself appear on the TV." |

## Rules

### Display names

- Everyone enters a **display name**: the host on the host device, each contestant on their phone.
- 1–20 characters, trimmed. Prefilled with the name that device used last time, so a returning player taps once.
- The host's name is shown on phones as "Hosted by {name}", and in the TV's player list. When the host joins the game, the same name is their contestant name.
- Two contestants with the same name: the later one is shown as "Name 2". Anyone can edit their own name until the game starts.
- **The host can edit every name** in the lobby's player list, until Start: their own and each contestant's. The same 1–20 character and "Name 2" rules apply. The renamed player's phone shows the new name at once ("You're in, Dan"). Either side can edit again; the latest edit wins. A rename lasts for this room only: it doesn't change the name the player's device suggests next time.

### Creating a room

- **Host a game** asks "What's your name?" (prefilled), then creates the room with up to 6 contestants (also the maximum) and the [game options](#game-options) this device used last (every season, any difficulty and Double Schmegettes on, the first time). The host lands on the lobby showing the new code.
- The device that pressed it is the **host device**. It shows the TV view and controls Start. It plays only if the host joins the game (below).
- No account is needed. If the device has no session, it signs in anonymously first, without showing anything. Hosting is invite-only: a device without host access enters a one-use host code first ([private access](../private-access/feature-brief.md)). Joining stays anonymous.
- **Room codes**: 5 characters made of letters and digits, with look-alikes (`0 O 1 I L`) left out so a code read off a TV is never ambiguous. Codes are unique among rooms that aren't closed.
- **One open lobby per host device.** When a host creates a room while they already have a room in `lobby`, the old room is closed. A room with a game in progress isn't touched.

### The host who also plays

The host plays on the **host device**, the same one that drives the TV. There's no second device.

- **Join** in the lobby first asks for the host device's microphone, with the same hard stop as phones ([gameplay](../gameplay/interaction-design.md#microphone-permission)); once it's allowed, it adds the host to the player list under their display name, with a "Host" tag. **Leave** takes them off again. Both are possible only until Start.
- A playing host counts toward the 1 contestant needed to Start, toward the player limit, and toward fresh boards, history, and placement like any contestant ([game-history](../game-history/feature-brief.md)).

The host device is an iPhone in landscape, mirrored to the TV ([gameplay](../gameplay/feature-brief.md)). Once the host joins, from Start on, it shows the normal TV view plus the host's controls in the **player column** on the right, visible to the room. In the lobby the host device shows no buzzer:

| Contestant action | On the host device |
|---|---|
| Buzz | The same **Buzz** button phones use, at the bottom of the player column, from Start. The space bar also buzzes on a keyboard. |
| Answer | Spoken into the host device's microphone |
| Pick a clue when in control | Tap the board and confirm, or press the buzzer (or the space bar) and say it ("Science for 400"). Only when the host has control: the host device can't pick for anyone else. |
| Daily Double wager | A number pad on the stage (the player column has no room for one). Daily Double wagers are public anyway. |
| Final wager | A masked number pad on the stage (`$ •••••`, keys never highlight). The host's tile says "wagering…", not the amount. |
| Final answer | Typed on a blind keypad on the stage, into a masked field (`•••••`), not on the iOS keyboard (which is mirrored and pops up each key). The host device never shows the host's answer before the reveal. |

**Fairness:**
- The host device never shows a correct response before an answer is judged, so playing on it tells the host nothing the others don't know.
- Each player's buzzer lights up on their own device when the server opens buzzing, the host's included. The TV's mirroring delay affects only the shared picture, not anyone's buzzer.
- A playing host can still override verdicts, their own included ([scoreboard and overrides](../scoreboard-and-overrides/feature-brief.md)). Every override, the host's own included, is labeled HOST OVERRIDE on the TV, so the room sees it.

### The lobby (host device / TV)

- Shows the **room code**, a **QR code** centered above it, and the join URL in plain text in the top line, where nothing else competes with it.
- The **QR code** opens `{site}/join/{code}`: the phone lands on this room's microphone step, with no code to type. It's drawn dark on a white square with a quiet margin in every theme, so phone cameras read it off a mirrored TV. The text URL stays for anyone whose camera won't scan.
- Shows **joined contestants** live, by display name, in the order they joined, with a count against the limit ("3 / 6"). The list is **folded away by default**: a slim "Players 3/6" tab on the right edge, so the code has the full width. A tap opens the list; another folds it. Every lobby opens folded. A join flashes the tab, so the host notices without opening it.
- The open list is the **player menu**: every name in it has ✎ to edit it until Start ([display names](#display-names)). Its footer says "Hosted by {name}" with ✎, so a host who isn't playing can still edit their own name.
- The lobby **doesn't show the game options**. They're only in the options sheet.
- **Join** / **Leave**: adds or removes the host as a contestant.
- **Voice** (🔊, an icon button with no text; its accessible name and tooltip give the voice, "Narrator voice: Norman") opens a list of the Schmegettes voices: Norman (the default), Kristin, and John. The device's built-in voices aren't offered. While the chosen voice downloads, a progress ring fills around the icon. Tapping a voice selects it and plays a sample line on the TV ("Here's Volcanoes for 400."), so the host hears it before Start. It's available only in the lobby. The rules for choosing a voice are in [gameplay](../gameplay/feature-brief.md#the-narrators-voice).
- **Options** (⚙, an icon button with no text; accessible name and tooltip "Game options") opens the [game options](#game-options).
- **Start** is enabled once at least **1 contestant** has joined (no hint text while it's disabled), counting the host if they joined, **and the narrator's voice is ready** on the host device. Until the voice is ready, Start reads "Getting Kristin ready… 40%". On a device that can't run the voices, Start stays disabled and the lobby says "This device can't run the Schmegettes narrator. Host from a recent iPhone, iPad or computer." It closes joining, and the room moves to `building_board`. What happens after that belongs to game-history and gameplay.

### Game options

The host sets how the game plays before Start. **Options** in the lobby opens a sheet with four settings:

| Option | Choices | Default |
|---|---|---|
| **Seasons** | A range of seasons, from 1 (1984) to 40 (2024), at least one season | All (1–40) |
| **Difficulty** | **Any**, **Easy**, **Medium** or **Hard**. Any uses every category, as before; a level keeps to the categories the boards and the Final are built from ([clue catalog](../clue-catalog/feature-brief.md#difficulty)) | Any |
| **Double Schmegettes** | On / Off. Off: Final Schmegettes follows the Single board | On |
| **Default spoken clue value** | **Ask** or **Lowest left**. Lowest left: a spoken pick of just a category picks the lowest clue left in it ([gameplay](../gameplay/feature-brief.md#the-board-and-control)). Ask: the phone says "Didn't catch the amount." and the player says it again or taps. It was called **Quick picks** (On / Off) before; the saved setting and the `quickPicks` contract field keep that name (Lowest left is `true`) | Ask |

- Only the host device sees and changes them, and only in the lobby. They lock at **Start**.
- Nobody else sees them: neither the lobby on the TV nor the phones show the options.
- The host device **remembers** the last options for the next room it hosts, like the voice. A **Rematch** keeps the room's options; the host can change them in the lobby before pressing Start again.
- **There's no timer option.** Every game gives 9 s to buzz in, then up to 6 s to begin an answer and 6 s to finish it ([gameplay](../gameplay/feature-brief.md#answering-and-judging)) ([gameplay](../gameplay/feature-brief.md#reading-and-buzzing)). A device or room that saved Relaxed or Fast from before plays with these times; a game already in progress, or one resumed later, keeps the times it started with.
- Seasons narrow which clues the board is built from. A narrow range can run out of fresh categories sooner; the board then falls back to the least-recently-seen ones, as it always does ([game history](../game-history/feature-brief.md#building-a-fresh-board)). The game always starts.
- Difficulty changes only which categories reach the board. Values, Daily Doubles, timers and scoring are the same at every level. Together with a narrow Seasons range, a level can run out of fresh categories sooner; the board then takes fresh ones from the next level over before repeating any ([game history](../game-history/feature-brief.md#building-a-fresh-board)). The game always starts.
- A room or device that saved its options before Difficulty existed plays Any.
- With Double Schmegettes off, the game has one board with its 1 Daily Double, then Final.
- **Default spoken clue value** changes only spoken picks that name a category without an amount. Taps, and spoken picks with an amount, work as always. It's Ask by default because a spoken pick has no confirmation: with Lowest left, an amount the microphone missed ("Opera for… 600" heard as "Opera") picks the lowest clue instead of asking again.

### Full screen on iPhone and iPad

iPhone and iPad Safari don't let a web page hide the browser's toolbar; only the app added to the Home Screen opens without it. Every other browser goes full screen on the first tap, as it does now.

- On an iPhone or iPad in Safari, not opened from the Home Screen, the **host lobby** shows a tip: "**For full screen, add Schmegettes to your Home Screen:** tap Share, then Add to Home Screen, and host from there." with ✕.
- ✕ hides it on that device for good. It's never shown on phones that join, in a game, or in the Home Screen app.
- The Home Screen app is a separate place to iOS: the host signs in (or redeems a host code) there once, and the narrator's voice downloads again there once.

### Joining (contestant phone)

- A player enters the code, **allows the microphone** (a hard stop: nobody plays without it, [gameplay](../gameplay/interaction-design.md#microphone-permission)), then enters their display name.
- The phone shows "You're in, {name}" and **the buzzer**, which stays on the phone from then until the game ends. In the lobby it's dim, and a tap only animates it (nothing is sent), so players can get a feel for it while they wait.

### Presence

- A joined player stays in the lobby list while disconnected, dimmed, and returns to normal on reconnect. Reloading the phone or the TV rejoins the same room as the same person, with no new prompt.
- A player who presses **Leave** is removed from the list at once.
- A lobby with no host device connected for **30 minutes** closes. Phones in it see "This room has closed."

## Out of scope

- A max-players setting (always 6)
- Renaming players after Start, or in a resume lobby (a resumed game keeps its names)
- A QR code on phones (to pass the room on from a phone)
- Removing (kicking) a player
- Joining as a spectator from the UI
- Hosting from a phone while a separate screen shows the TV view (a TV browser or a second display)
- The board and gameplay after Start
