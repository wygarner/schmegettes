---
task-type: enhancement
task-title: "A Home button on every screen"
---
**Task Type:** Enhancement. Adds a consistent way back to Home to every existing screen, from QA on 2026-11-21.

**Product docs:** [navigation/feature-brief.md](../../docs/product-docs/features/navigation/feature-brief.md) and [navigation/interaction-design.md](../../docs/product-docs/features/navigation/interaction-design.md) (PR #268). Remove their "Not built yet" lines when it ships, and mention the Home control under "Headers" in [design-system.md](../../docs/product-docs/architecture/design-system.md).

**Problem:** Only the menu screens have "‹ Home". The join steps, the host lobby, every game screen and the end-of-game scoreboard have no way back to the main menu. On a host iPhone in landscape, or the Home Screen app, there's no browser back button either, so a host who opens the wrong thing is stuck.

**Outcomes:**
- Every screen but Home has a Home control in the top-left corner (menu screens keep "‹ Home"; join, lobby and game screens get a small ⌂ icon button; the game scoreboard gets ⌂ next to "‹ My games").
- Going Home never takes anyone out of a room: they stay in it and Home offers **Rejoin**, as after closing the tab.
- During a game, Home asks first and then works like a dropped connection: a contestant keeps their score, the host device pauses the game.
- A contestant can't use Home to dodge a wrong answer: ⌂ is dimmed while they're answering.

**Player flow:**
- **Menus, join steps, lobby, end-of-game scoreboard:** tap ⌂ → Home at once. In a lobby, the player stays listed, dimmed "(reconnecting)", and Home shows "You're in a lobby" with Rejoin. The host's lobby stays open (it closes after 30 minutes with no host device, as always).
- **Contestant mid-game:** tap ⌂ → "Leave the game? Your score stays. You can rejoin from Home." **Leave game** / **Stay**. The game keeps running behind the sheet. Leave game → Home with "Game in progress" and Rejoin; in the game they're "(reconnecting)" and the existing disconnect rules apply (control passes after 10 s; Daily Double and Final rules per wagers).
- **Host device mid-game:** the same sheet says "The game pauses for everyone until you rejoin from Home." Leave game pauses the game, as when the host device disconnects; Rejoin resumes it, and after 30 minutes it's abandoned and resumable.
- **Edge cases** (full list in the interaction design): ⌂ is dimmed while that contestant is answering ("After your answer"); the game ending while the sheet is open closes it; the browser back button is unchanged and gets no confirmation; a screen reader announces "Home" and the dialog "Leave the game?".

**Success Criteria:**
- Every route (`/join`, `/join/{code}` in each step and phase, `/host/{code}` in lobby, resume lobby and each phase, `/games`, `/games/{id}`, `/stats`, `/stats/leaderboard`, `/account`) has a Home control in the top-left; Home itself has none.
- From a lobby or a game, going Home and pressing Rejoin returns the player to the same seat and score, with no name prompt.
- Leaving mid-game as the host pauses the game for everyone; rejoining resumes it.
- While a contestant is answering, ⌂ does nothing.
- On the host device at 667 × 320, ⌂ never covers the code, the board, the buzzer or the host's controls.

**Out of scope:** A menu or drawer with other destinations; leaving a game for good; the host ending a game early; changing what the browser back button does.
