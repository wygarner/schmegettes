# Getting Home: Interaction Design

Not built yet (task `home-from-every-screen`). Rules: [feature brief](./feature-brief.md).

## The Home control

| Screen kind | Control | Where |
|---|---|---|
| Menu screens (My games, Stats, Account) | "‹ Home" back link, as the [design system](../../architecture/design-system.md#headers) has it today | Top bar, left |
| Deeper menu screens (`/games/{id}`) | "‹ My games" back link, plus a house icon button | Back link left; house right of the large title row's top bar |
| Phone join and game screens (`/join`, `/join/{code}`: code, microphone, name, "You're in", every game phase, end-of-game scoreboard) | House icon button | Top-left, above everything else, never over the buzzer |
| Host device (`/host/{code}`: lobby, resume lobby, every game phase, end-of-game scoreboard) | House icon button | Top-left corner of the stage, left of "SCHMEGETTES" in the lobby |

- The house icon button: 44 × 44 px tap target, the icon about 20 px, `QUIET` color, no fill. Accessible name and tooltip "Home". It doesn't scale with the stage, so on the TV it stays small.
- With the [Home Screen tip](../lobby/interaction-design.md#home-screen-tip-iphone-and-ipad-safari-only) showing, the button sits to the left of the tip's text.

## Leaving a game

```text
┌──────────────────────────────────────────┐
│                  ⌂                       │
│          Leave the game?                 │
│   Your score stays. You can rejoin       │
│   from Home.                             │
│                                          │
│   [          Leave game          ]       │
│   [             Stay             ]       │
└──────────────────────────────────────────┘
```

1. The player taps ⌂ during a game. A confirmation slides up ([design system](../../architecture/design-system.md) sheets): **Leave game** (red, primary) and **Stay** (ghost).
2. The game doesn't stop for the question. Buzzing, timers and picks carry on behind it, and the buzzer underneath keeps updating. If the player has control, the usual 10 s rule applies once they've left.
3. **Leave game** closes the socket and goes to `/`. Home's top card shows "**Game in progress**" with **Rejoin** within a second.
4. **Stay**, ✕, a tap outside, or Escape closes it.

The host device's sheet says "The game pauses for everyone until you rejoin from Home." Since it's mirrored, the room sees it too, which is fine: they'll see the game pause anyway.

## Edge cases

| Situation | Behavior |
|---|---|
| A contestant taps ⌂ while answering | Nothing: ⌂ is dimmed until the answer is judged ([feature brief](./feature-brief.md#rules)). Its tooltip says "After your answer" |
| A contestant taps ⌂ while they have control | Leave game: control passes after 10 s, as with a dropped connection |
| A contestant leaves during a Daily Double or Final | The [wagers](../wagers/feature-brief.md#fairness-and-disconnects) disconnect rules apply: an unset wager becomes $5 (Daily Double) or $0 (Final), and a Final answer uses the last draft the server got |
| The game ends while the sheet is open | The sheet closes and the end-of-game scoreboard shows. ⌂ now goes Home at once |
| A player taps ⌂ in the lobby | Home at once. They stay in the list, dimmed "(reconnecting)", and Home shows "You're in a lobby" with Rejoin |
| The host taps ⌂ in the lobby | Home at once. The lobby stays open (it closes after 30 minutes with no host device, as always). Home shows "You're in a lobby" with Rejoin |
| The host goes Home from a lobby, then presses Host a game | The old lobby closes, as it does today |
| A playing host taps ⌂ mid-game | Same sheet as the host device: the game pauses for everyone |
| ⌂ on the microphone or name step | Home at once; nothing was joined yet |
| The browser's back button | Unchanged. It isn't a substitute for ⌂, and it gets no confirmation |
| A screen reader | ⌂ is announced as "Home"; the sheet is a dialog titled "Leave the game?" |
