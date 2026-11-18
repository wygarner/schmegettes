---
jira-type: new-feature
jira-title: "Rejoin a game in progress from Home; resume an unfinished game"
---
**Task Type:** New Feature. Net-new: a way back into a live game after leaving the page, and resuming abandoned games, which today are final.

**Depends on:** `lobby-game-options` only in that a resumed game keeps its options; can ship before it (a resumed game then simply uses the defaults it had).

**Product docs:** `docs/product-docs/features/rejoin-games/feature-brief.md` and `interaction-design.md` (new); references in `features/gameplay/feature-brief.md` (Fairness and disconnects), `features/game-history/*` (abandoned games).

**Problem:** A player who closes the tab has no way back into their game. A game whose host device is gone 30 minutes is abandoned for good, losing the board and scores.

**Outcomes:**
- Anyone in a room that hasn't ended gets back in with one tap from Home.
- A host can pick up an Unfinished game within 30 days: same board, scores and control.

**Player flow:**
- **Rejoin (live):** Home shows a card at the top for the room the account is in: "GAME IN PROGRESS · K7RXM · Alice, Bob, You" / "YOU'RE IN A LOBBY · K7RXM" with **Rejoin** → `/host/{code}` for the host, `/join/{code}` for a contestant, as a reload would. Same account only (same browser, or signed-in account on another device; the game then moves to the new device and the old page says "You're playing on another device."). Gone when the game ends or the player left the lobby.
- **Resume (abandoned):** on an Unfinished game they hosted, the host sees **Resume game** ("You can resume until {date}") on `/games/{id}`, for 30 days after it was abandoned. It opens a **resume lobby** with a new code (old room closed): the game's contestants with scores, dimmed until back. Contestants join with the code or a Home card "WYATT IS RESUMING YOUR GAME · M4QTP · Join", matched by account, with no name prompt ("You're back, Alice. $1,200"). Nobody new can join. No options button. **Resume** once one contestant is back (a playing host counts) and the voice is ready.
- **Where it picks up:** board → board, same control (absent controller → passes after 10 s). Mid-clue or mid-Daily Double → board, that clue done with no score change. Correct response → board (the next board, or Final, if it was the round's last clue). Interstitial → Double board. Final category/wager/answer → Final category again, entered from scratch. Final reveal → reveal from the start, answers kept.
- Contestants who don't come back keep seat and score "(reconnecting)", can join later, and are in Final if above $0. A resumed game is the same game in history; it ends finished or abandoned again, and can be resumed again.
- Finished after resuming counts as finished in My games and stats; date stays the original start; length counts time played.

**Success Criteria:**
- Closing the tab mid-game and opening Home shows the card; Rejoin restores the seat, score and buzzer state; for the host, the TV view.
- An abandoned game, resumed by its host: board, done clues, scores and control match the moment it was abandoned, per the table above; seen clues unchanged.
- A non-player can't join a resume room; a contestant's account takes back exactly their seat.
- A resumed then finished game appears once in My games as finished, and stats count it.
- Resume isn't offered to non-hosts, on finished games, or after 30 days (server enforced).

**Out of scope:** taking someone else's seat, resuming by anyone but the host, past 30 days, games that never left the lobby, changing options on resume.
