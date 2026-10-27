# Hosting a Game: Interaction Design

## Screens

| Route | Device | Shows |
|---|---|---|
| `/` | any | **Host a game**, code field + **Join** (exists today) |
| `/host/{code}` | host device (TV) | Lobby: code, join URL, host name, contestants, **Join from my phone**, **Start** |
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
│   ● Alice    ● Bob    ◌ Carol (reconnecting)             │
│                                                          │
│  [ Join from my phone ]               [   Start   ]      │
└──────────────────────────────────────────────────────────┘
```

- The code is the biggest thing on screen (Oswald, readable at 3 m), letters spaced.
- **✎** next to the host name edits it until Start.
- A new player animates into the list. There is no sound in v1.
- **Start**: primary button. While there are fewer than 2 contestants it is disabled, with the hint "Need at least 2 players".
- **Join from my phone** opens a modal: "On your phone, go to {site}/join and enter **K7RXM**". The code is large. The modal closes on its own when a new player joins.

### Join (phone, including the host's own phone)

1. Player enters the code on Home → `/join/K7RXM`.
2. "What's your name?" with the last name used prefilled, then **Join**.
3. "You're in, Alice. Look at the TV. Wyatt will start the game." with **Edit name** and **Leave**.
4. On Start everyone sees "Shuffling a fresh board…" ([game-history](../game-history/interaction-design.md)).

### Start (host device)

1. Host presses **Start** (2 or more contestants). The button shows a spinner, and joining closes immediately.
2. TV and phones go to `building_board`.

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
| Contestant has the same name as the host | Allowed with no suffix. The host isn't in the player list. |
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
