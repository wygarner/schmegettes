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

```text
┌──────────────────────────────────────────────────────────┐
│  SCHMEGETTES                         Hosted by Wyatt  ✎  │
│                                                          │
│              Join at {site}/join                         │
│                                                          │
│                  K 7 R X M                               │
│                                                          │
│  Players  3 / 6                                          │
│   ● Wyatt HOST   ● Alice   ◌ Bob (reconnecting)          │
│                                                          │
│  [ Leave the game ]                   [   Start   ]      │
└──────────────────────────────────────────────────────────┘
```

- The code is the biggest thing on screen (Oswald, readable at 3 m), letters spaced.
- **✎** next to the host name edits it until Start.
- A new player animates into the list. There is no sound in v1.
- **Start**: primary button. While there are fewer than 2 contestants it is disabled, with the hint "Need at least 2 players". A playing host counts.
- **Join the game** (secondary) adds the host to the list at once, under their host name, tagged HOST, and the button becomes **Leave the game**. Editing the host name with ✎ updates both places.

### Join (phone)

1. Player enters the code on Home → `/join/K7RXM`.
2. "What's your name?" with the last name used prefilled, then **Join**.
3. "You're in, Alice. Look at the TV. Wyatt will start the game." with **Edit name** and **Leave**.
4. On Start everyone sees "Shuffling a fresh board…" ([game-history](../game-history/interaction-design.md)).

### Start (host device)

1. Host presses **Start** (2 or more contestants). The button shows a spinner, and joining closes immediately.
2. TV and phones go to `building_board`.

### Playing on the host device (in game)

When the host joined, a player bar sits along the bottom of the TV view. It's visible to the room and only ever shows the host's own controls. It follows the same rules as a phone ([gameplay](../gameplay/interaction-design.md)):

```text
┌──────────────────────────────────────────────────────────┐
│                    (board / clue)                        │
├──────────────────────────────────────────────────────────┤
│  Wyatt  $1,200            [        BUZZ  (space)       ] │
└──────────────────────────────────────────────────────────┘
```

| Phase | Player bar |
|---|---|
| `board`, host has control | "Your pick": tap the board or say it |
| `clue_reading` | **Buzz** dimmed. Pressing it early gives the same lockout as on a phone. |
| `buzzing_open` | **Buzz** lit |
| `answering`, host buzzed | "Answer now" with a mic level meter |
| `daily_double_wager` (host's) | Amount field |
| `final_wager` | Masked field `$ •••••`. The TV shows "Wyatt is wagering…" |
| `final_answer` | "Answer now" with a mic meter. No transcript shown. |

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
| Host presses Start while a player is mid-join | Whoever has finished joining when the server handles Start is in. The rest see "This game has already started." |
| A player leaves so the count drops below 2 | Start disables again |
| Host presses Host a game again on Home while their lobby is open | The old lobby closes ("This room has closed" on its phones) and a new code appears |
| Room creation fails | Back to Home with "Couldn't create a room. Try again." |
