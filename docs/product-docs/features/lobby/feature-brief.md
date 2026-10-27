# Hosting a Game: Room and Lobby

## Why

Every game starts with one person pressing **Host a game** on the device that will drive the TV. The host gives their name, and a room is created. The TV then works as the lobby. It shows the code big enough to read from the couch, shows each player by name the moment they join, tells the host how to join from their own phone, and has **Start** when everyone is in.

## Jobs to be done

| Who | Job |
|---|---|
| Host | "I tap one button, say who I am, and get a code I can put up on the TV." |
| Host | "I can see who has joined, by name, so I know when everyone's in." |
| Host | "I want to play too, so I join from my phone like everyone else." |
| Host | "When we're ready, I start the game with one press." |
| Contestant | "I type the code from the TV, enter my name, and see myself appear on the TV." |

## Rules

### Display names

- Everyone enters a **display name**: the host on the host device, each contestant on their phone.
- 1–20 characters, trimmed. Prefilled with the name that device used last time, so a returning player taps once.
- The host's name is shown on the TV and on phones as "Hosted by {name}". The host is not a contestant, so their name isn't in the player list and never clashes with one.
- Two contestants with the same name: the later one is shown as "Name 2". Anyone can edit their own name until the game starts.

### Creating a room

- **Host a game** asks "What's your name?" (prefilled), then creates the room with the default settings: up to 6 contestants, every season. The host lands on the lobby showing the new code.
- The device that pressed it is the **host device**. It shows the TV view and controls Start. It never plays and never scores ([product overview](../../architecture/product-overview.md)).
- No account is needed. If the device has no session, it signs in anonymously first, without showing anything.
- **Room codes**: 5 characters made of letters and digits, with look-alikes (`0 O 1 I L`) left out so a code read off a TV is never ambiguous. Codes are unique among rooms that aren't closed.
- **One open lobby per host device.** When a host creates a room while they already have a room in `lobby`, the old room is closed. A room with a game in progress isn't touched.

### The host who also plays

The TV mirrors the host device, so anything on that device is visible to the room. A host who wants to play therefore uses **two devices**:

| Device | Role | Shows |
|---|---|---|
| Host device (TV) | Host | Code, players, board, clues. Host-only controls: Start, override a verdict. Never a buzzer. |
| Host's phone | Contestant | Buzzer, microphone, wagers, like every contestant |

Their phone is an ordinary contestant with its own name, score, and history. Hosting gives no advantage: the TV never shows the correct response before an answer is judged.

### The lobby (host device / TV)

- Shows the **room code**, the join URL in plain text, and "Hosted by {name}".
- Shows **joined contestants** live, by display name, in the order they joined, with a count against the limit ("3 / 6").
- **Join from my phone**: shows the join URL and code large, with "On your phone, go to {site}/join and enter K7RXM." It's the same join any player does.
- **Start** is enabled once at least **2 contestants** have joined. It closes joining, and the room moves to `building_board`. What happens after that belongs to game-history and gameplay.

### Joining (contestant phone)

- A player enters the code, then their display name.
- The phone shows "You're in, {name}" with "Look at the TV. {host} will start the game."

### Presence

- A joined player stays in the lobby list while disconnected, dimmed, and returns to normal on reconnect. Reloading the phone or the TV rejoins the same room as the same person, with no new prompt.
- A player who presses **Leave** is removed from the list at once.
- A lobby with no host device connected for **30 minutes** closes. Phones in it see "This room has closed."

## Out of scope

- QR code for joining
- Room settings before Start (seasons, max players). The API supports them; the UI comes later.
- Removing (kicking) a player
- Joining as a spectator from the UI
- Making the host device a contestant (it can't have a private buzzer while it's mirrored)
- Linking the host's phone to the host device, for example to carry the name over or to start from the phone
- The board and gameplay after Start
