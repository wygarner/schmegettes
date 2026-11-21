# Getting Home

Not built yet (task `home-from-every-screen`). Today the menu screens (My games, Stats, Account) have "‹ Home", the game scoreboard has "‹ My games", and the join, lobby and game screens have no way back except the browser's back button or an error page's link.

## Why

Home is the main menu: Host a game, Join, My games, Stats, Account. A player who's on the wrong screen, or done with one, should never have to guess how to get back to it. On an iPhone held in landscape for the TV, or a Home Screen app with no browser toolbar, there is no back button at all.

## Jobs to be done

| Who | Job |
|---|---|
| Anyone | "Whatever screen I'm on, one tap gets me back to the main menu." |
| Contestant | "I need to step away from the game. I can go Home without losing my seat, and get back in." |
| Host | "I opened the wrong thing on the TV. I get back to Home without a game breaking by accident." |

## Rules

- **Every screen but Home has a Home control**, always in the same place: the top-left corner. Sheets and dialogs don't; closing them returns to their screen.
- **Home never takes you out of a room.** Going Home is like closing the tab: you stay in the room, and Home's card offers **Rejoin** ([rejoin and resume](../rejoin-games/feature-brief.md)). Only **Leave** removes you from a lobby.
- **No confirmation outside a game.** Menus, the join steps, the lobby, and the end-of-game scoreboard go Home at once. Nothing is lost there.
- **During a game, Home asks first**: from `building_board` until the end-of-game scoreboard, paused included. Confirming does what a dropped connection does:

  | Who | Confirmation | What happens |
  |---|---|---|
  | Contestant (phone) | "**Leave the game?** Your score stays. You can rejoin from Home." **Leave game** / **Stay** | Shown "(reconnecting)", keeps their score, loses control after 10 s; the [gameplay](../gameplay/feature-brief.md#fairness-and-disconnects) and [wagers](../wagers/feature-brief.md#fairness-and-disconnects) disconnect rules apply |
  | Host device, playing or not | "**Leave the game?** The game pauses for everyone until you rejoin from Home." **Leave game** / **Stay** | The game pauses, as when the host device disconnects. After 30 minutes away it's abandoned, and the host can resume it later |

- **Not while answering.** A contestant's Home control is dimmed and does nothing while they're answering a clue (their buzzer is green, at most 9 s). Otherwise leaving on purpose would dodge a wrong answer, since a dropped connection mid-answer costs nothing on a normal clue. It works again the moment the answer is judged.
- The host's Home control is mirrored to the TV like everything else. It's small and quiet so it doesn't distract, and it's never where a contestant's buzzer or the host's game controls are.
- **Deeper screens** (a game's scoreboard, the leaderboard tab) keep their "‹ My games" or tab back link and also have the Home control, so Home is always one tap away.

## Out of scope

- A menu or drawer beyond Home (links to My games or Stats from a game screen)
- Leaving a game for good from the confirmation (Leave stays a lobby action; a contestant who doesn't come back stays "(reconnecting)" until the game ends)
- Ending a game early as the host
