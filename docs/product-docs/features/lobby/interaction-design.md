# Hosting a Game: Interaction Design

## Screens

| Route | Device | Shows |
|---|---|---|
| `/` | any | **Host a game**, code field + **Join** (exists today) |
| `/host/{code}` | host device (TV) | Lobby: code, QR, players, **Join from my phone**, **Start** |
| `/join/{code}` | phone | Name entry, then "You're in" |

## States of a room (lobby part)

```text
Host a game ─▶ creating ─▶ lobby ──Start──▶ building_board ─▶ (gameplay)
                  │          │
                  │          └─ host gone 30 min / new room by same host ─▶ closed
                  └─ fails ─▶ Home with "Couldn't create a room. Try again."
```

## Flows

### Host a game (host device)

1. Host presses **Host a game**. The button shows a spinner and can't be pressed again.
2. The room is created (target under 1 s) and the browser goes to `/host/K7RXM`.
3. The lobby shows the code and QR code at once. The player list starts empty: "Waiting for players…"

### Lobby (TV view)

```text
┌──────────────────────────────────────────────────────────┐
│  SCHMEGETTES                                             │
│                                                          │
│        Join at {site}/join            ┌────────┐         │
│                                       │ ▓▓ QR  │         │
│            K 7 R X M                  │ ▓▓     │         │
│                                       └────────┘         │
│                                                          │
│  Players  3 / 6                                          │
│   ● Alice    ● Bob    ◌ Carol (reconnecting)             │
│                                                          │
│  [ Join from my phone ]               [   Start   ]      │
└──────────────────────────────────────────────────────────┘
```

- The code is the biggest thing on screen (Oswald, readable at 3 m), letters spaced.
- A new player animates into the list. There is no sound in v1.
- **Start**: primary button. While there are 0 contestants it is disabled and the hint "Need at least 1 player" shows.
- **Join from my phone** opens a modal with a large QR code and "Scan with your phone to play." It closes on its own when a new player joins.

### Join (phone)

1. Player scans the QR code or enters the code on Home → `/join/K7RXM`.
2. "What's your name?" with last used name prefilled, then **Join**.
3. "You're in, Alice. Look at the TV." with **Leave**.
4. On Start everyone sees "Shuffling a fresh board…" ([game-history](../game-history/interaction-design.md)).

### Start (host device)

1. Host presses **Start**. The button shows a spinner, and joining closes immediately.
2. TV and phones go to `building_board`.

## Edge cases

| Situation | Behavior |
|---|---|
| Wrong or unknown code | Phone: "No room with that code." Stays on the code field. |
| Room full | Phone: "This room is full (6/6)." |
| Join after Start | Phone: "This game has already started." |
| Room closed | Phone: "This room has closed." with a link Home |
| Duplicate name | Shown as "Alice 2" |
| Host reloads the TV | Returns to the same lobby with the same players |
| Host opens `/host/{code}` on a second device | That device is the same account only if it's the same browser session. Otherwise "Only the host can open this screen" and a link to join |
| Player reloads | Rejoins as the same player, with no name prompt |
| Player disconnects | Stays listed, dimmed "(reconnecting)". Start still counts them. |
| Two Start presses (double tap) | Only the first counts. The second does nothing. |
| Host presses Start while a player is mid-join | Whoever has finished joining when the server handles Start is in. The rest see "This game has already started." |
| Host presses Host a game again on Home while their lobby is open | The old lobby closes ("This room has closed" on its phones) and a new code appears |
| Room creation fails | Back to Home with "Couldn't create a room. Try again." |
