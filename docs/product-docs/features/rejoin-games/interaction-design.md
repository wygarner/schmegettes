# Rejoin and Resume Games: Interaction Design

Rules: [feature brief](./feature-brief.md).

## States

```text
                        Resume game (host, ≤30 days)
abandoned ───────────────────────────────▶ resume lobby ──Resume──▶ board (where it left off)
    ▲                                          │                        │
    │                                          └─ host gone 30 min ─────┤
    └──────────────── host gone 30 min (as any game) ◀──────────────────┘
```

The resume lobby is a lobby that only the game's contestants can join, showing their scores.

## Screens

### Home: the game card

```text
┌──────────────────────────────────────────┐
│ ┌──────────────────────────────────────┐ │
│ │ GAME IN PROGRESS · K7RXM             │ │
│ │ Alice, Bob, You          [ Rejoin ]  │ │
│ └──────────────────────────────────────┘ │
│              (Home as today)             │
└──────────────────────────────────────────┘
```

- Above everything else on Home, in the accent color with the board bevel.
- Variants: "YOU'RE IN A LOBBY · K7RXM" (**Rejoin**), "WYATT IS RESUMING YOUR GAME · M4QTP" (**Join**).
- It loads with Home. If the room ended in the meantime, tapping it shows "That game has ended." and the card goes away.

### My games: Resume

On the page of an Unfinished game the viewer hosted (`/games/{id}`), under "Unfinished: these are the scores when the room closed.":

```text
│  [ Resume game ]   You can resume until Dec 18. │
```

- Not shown to contestants, on finished games, or after 30 days.
- Pressing it shows a spinner, creates the room, and opens the resume lobby on that device, which becomes the host device.

### Resume lobby (host device / TV)

The same layout as the lobby ([lobby](../lobby/interaction-design.md)), with the player list folded into its tab by default. Opened, it shows:

```text
┌───────────────────────────────────────────────────┬───────────────────┐
│  RESUMING · Started Sat, Nov 14   Hosted by Wyatt │  Players  1 / 3   │
│                                                   │  ● Alice  $1,200  │
│              Join at {site}/join                  │  ◌ Bob     $400   │
│                                                   │  ◌ Wyatt  −$200   │
│                  M 4 Q T P                        │                   │
│                                                   │                   │
│  [ Leave ]                     🔊       [ Resume ] │                   │
└───────────────────────────────────────────────────┴───────────────────┘
```

- Contestants who aren't back are dimmed (◌). The count is "back / total".
- **Resume** is enabled once one contestant is back (the host counts if they played) and the narrator's voice is ready. No **Options** button: options are the game's.
- **Join / Leave** appear only if the host played in the original game; the host's seat and score are theirs.

### Phone

- Joining a resume room: code, the microphone screen if the browser asks again, then straight to "You're back, Alice. $1,200" with the buzzer. No name prompt: the name is the one from the game.
- After **Resume**, the phone shows the board as usual.

## Edge cases

| Situation | Behavior |
|---|---|
| Someone who wasn't in the game enters the resume code | "This game is being resumed. Only its players can join." |
| A contestant was anonymous and cleared their browser | They're a new account, so they can't take their seat. The seat stays "(reconnecting)" |
| A contestant who isn't back holds control | Control passes after 10 s to the next connected contestant, as usual |
| The host presses Resume game twice (double tap) | One room is created |
| The host presses Resume game while the same game's resume lobby is open on another device | The open resume lobby is reused; the second device gets the "Only the host…" rule if it's another session |
| The host has another lobby open | It closes, as when hosting a new game ([lobby](../lobby/feature-brief.md#creating-a-room)) |
| The resume lobby sits with no host device for 30 minutes | It closes; the game is Unfinished again and can be resumed again within the 30 days |
| A contestant renamed their account since | Their name in the game stays the name they used in it |
| A contestant's account was deleted | Their seat is "Former player", kept with its score, never back |
| Player opens Rejoin on a second device | The game moves to the new device; the old page shows "You're playing on another device." |
