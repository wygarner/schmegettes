# Hosting a Game: Room and Lobby

## Why

Every game starts with one person pressing **Host a game** on the device that will drive the TV. That press creates a room immediately: there are no setup steps before the code is on screen. The TV then works as the lobby. It shows the code big enough to read from the couch, shows each player the moment they join, gives the host a way to join from their own phone, and has **Start** when everyone is in.

## Jobs to be done

| Who | Job |
|---|---|
| Host | "I tap one button and get a code I can put up on the TV." |
| Host | "I can see who has joined, so I know when everyone's in." |
| Host | "I want to play too, so I can get my phone in without typing the code." |
| Host | "When we're ready, I start the game with one press." |
| Contestant | "I type the code from the TV (or scan it), enter my name, and see myself appear on the TV." |

## Rules

### Creating a room

- **Host a game** creates a room right away with the default settings (up to 6 contestants, every season). The host lands on the lobby showing the new code. There is no settings step first.
- The device that pressed it is the **host device**. It shows the TV view and controls Start. It never plays and never scores ([product overview](../../architecture/product-overview.md)).
- No account is needed. If the device has no session, it signs in anonymously first, without showing anything.
- **Room codes**: 5 characters made of letters and digits, with look-alikes (`0 O 1 I L`) left out so a code read off a TV is never ambiguous. Codes are unique among rooms that aren't closed.
- **One open lobby per host device.** When a host creates a room while they already have a room in `lobby`, the old room is closed. A room with a game in progress isn't touched.

### The lobby (host device / TV)

- Shows the **room code**, a **QR code** that opens the join page with the code filled in, and the join URL in plain text.
- Shows **joined players** live, in the order they joined, with a count against the limit ("3 / 6").
- **Join from my phone**: shows the QR code large, with the caption "Scan with your phone to play." It's the same join any player does. The host's phone becomes an ordinary contestant with its own name and history.
- **Start** is enabled once at least **1 contestant** has joined. It closes joining, and the room moves to `building_board`. What happens after that belongs to game-history and gameplay.

### Joining (contestant phone)

- A player enters the code (or scans the QR code), then a **name**: 1–20 characters, prefilled with the name they used last time.
- Two players with the same name: the later one is shown as "Name 2". The player can still edit their name before the game starts.
- The phone shows "You're in" with their name. It also says "Look at the TV. The host will start the game."

### Presence

- A joined player stays in the lobby list while disconnected, dimmed, and returns to normal on reconnect. Reloading the phone or the TV rejoins the same room as the same person, with no new prompt.
- A player who presses **Leave** is removed from the list at once.
- A lobby with no host device connected for **30 minutes** closes. Phones in it see "This room has closed."

## Out of scope

- Room settings before Start (seasons, max players). The API supports them; the UI comes later.
- Removing (kicking) a player
- Joining as a spectator from the UI
- Making the host device a contestant
- The board and gameplay after Start
