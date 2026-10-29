---
jira-type: enhancement
jira-title: "Gameplay polish: always-on buzzer, controller-only picks, iPhone-landscape host screen"
---
**Task Type:** Enhancement (changes the existing gameplay and lobby features; no new capability)

**Problem:** First play-throughs showed rough edges. Phones show text instead of a buzzer until a clue comes up, and the host's player bar uses a different, smaller buzzer. The host device can pick a clue for anyone at any time. Picks happen silently, and a mis-tap on the phone board picks the wrong clue with no way back. Scores drop off the host screen during clues. Players get cut off while answering, and the correct response flashes by too fast, crowded by the clue text. The host screen is laid out for a wide TV, but the host device is an iPhone held sideways and mirrored to the TV.

**Outcomes:**
- A contestant always has the buzzer in front of them, from the lobby on, and it looks and behaves the same on every device.
- Only the player in control picks a clue, and a tapped pick is confirmed first.
- The room hears which clue was picked before the clue is read.
- Everyone can see every score and who's picking, at all times.
- Players have time to answer and to take in the correct response.
- The host screen fits an iPhone in landscape without scrolling.

**Player flow:**

Durable docs: [gameplay feature brief](../../docs/product-docs/features/gameplay/feature-brief.md), [gameplay interaction design](../../docs/product-docs/features/gameplay/interaction-design.md), [lobby feature brief](../../docs/product-docs/features/lobby/feature-brief.md), [lobby interaction design](../../docs/product-docs/features/lobby/interaction-design.md). Summary of the changes:

1. **Buzzer on the phone from the lobby on.** After joining, the phone shows "You're in, Alice.", the mic prompt, Edit name / Leave, and the buzzer pinned to the bottom. "Look at the TV. Wyatt will start the game." is removed. The buzzer stays on every phone screen until the game ends. Outside a clue it is `idle`: dim, and a tap only animates it (nothing is sent, no lockout).
2. **One buzzer component.** Phones and the host device (when the host plays) render the same `Buzzer`: same look, labels and states (`idle`, `dim`, `lit`, `early`, `answering` "Answer now", `locked`), full width of its container, at least 64 px tall. The host's compact 56 px variant goes away.
3. **Only the controller picks.** The TV board is tappable only when the host plays and has control. The server rejects a pick from anyone but the player in control (`not_in_control`), the host device included. Today it accepts the host device's pick at any time.
   - Controller disconnected on the board for **10 s**: control passes to the next connected contestant in join order. Back within 10 s: they keep it.
   - A connected controller who doesn't pick: the game waits, with no timer and no hint.
4. **Tap-pick confirmation.** Tapping a board cell (phone, or host device when the host has control) opens "Volcanoes for $400?" with **Cancel** / **Pick**. A spoken pick goes straight through. The modal closes on its own if control passes or the phase leaves `board`.
5. **Pick announcement.** On a pick the host device says "Here's Volcanoes for 400." and then reads the clue. The value is spoken as a number, not "dollars". Buzzing opens when both are done; the fallback reading time counts the announcement's words too, and its cap rises from 12 s to 14 s.
6. **Player column on the host screen.** Every host screen (lobby, board, clue, answering, correct response, "Double Jeopardy!", paused, game over) has a right-hand column with a tile per contestant: name and score. The player in control has a 3 px `yellow.4` border and a "PICKING" label. Disconnected players are dimmed. The host's buzzer sits at the bottom of the column when the host plays.
7. **No pick caption.** "Waiting for Alice to pick…" and "The host can tap a clue to pick." are removed, along with the 15 s hint timer. The highlighted tile replaces them.
8. **Phone pick screen.** The "Your pick" heading and the score next to it are removed. The phone shows the mini board, **🎤 Say it**, and the buzzer.
9. **Timing.** Answer window 7 s → **14 s** (silence still ends it early). Correct response on screen 3 s → **6 s**. The buzz window (5 s), lockout (250 ms) and "Double Jeopardy!" (3 s) are unchanged.
10. **Correct-response screen without the clue.** It shows the category and value, the verdict line when there is one, and "Correct response: **Mauna Loa**". The clue text is gone.
11. **Host screen for iPhone landscape.** Design target 844 × 390. No scrolling from 667 × 320 (iPhone SE with Safari's bars) up to 956 × 440, inside the safe-area insets. Stage on the left (about 72%), player column on the right (about 28%, at least 180 px). Up to 5 contestants get two-line tiles; 6 or more get one-line tiles of at least 32 px. A phone-sized host device held upright shows "Turn your phone sideways"; the game keeps running.

**Edge cases:**

| Situation | Behavior |
|---|---|
| Tap confirm and voice pick at the same moment | The first pick the server receives wins |
| Someone taps the TV board without control | Nothing happens; no pick is sent |
| Controller disconnects with the modal open, or control passes | The modal closes; nothing is picked |
| The only connected contestant is the controller and disconnects | Control stays; the game waits |
| Host device reconnects mid-clue | The announcement and clue are read again from the start |
| Buzzer tapped in the lobby, on the board or between clues | Animation only; no message and no lockout |
| 8 contestants plus the host's buzzer at 667 × 320 | One-line 32 px tiles; the board shrinks so every row stays visible |

**Success Criteria:**
- A phone shows the buzzer on every screen from "You're in" to game over, and "Look at the TV. … will start the game." no longer appears.
- Phone and host device render the same `Buzzer` component (no `compact` variant).
- A `select_clue` from the host device without control is rejected by the server; the TV board doesn't react to taps unless the host has control.
- After a controller has been disconnected on the board for 10 s, the next connected contestant in join order has control and their tile is highlighted.
- A tapped pick needs **Pick** in the modal before anything is sent; a voice pick sends at once.
- After a pick, the host device says "Here's {category} for {value}." before the clue, and buzzing opens only after both.
- Every host game screen shows every contestant's name and score, with the controller's tile highlighted. No "Waiting for … to pick" text and no host-pick hint.
- The phone pick screen has no "Your pick" heading and no score.
- The answer window is 14 s and the correct-response screen lasts 6 s; the client countdowns match.
- The correct-response screen doesn't show the clue text.
- At 844 × 390 and 667 × 320 the host lobby and every game screen fit without scrolling, with 2 and with 8 contestants.

**Out of scope:**
- Highlighting the answering player's tile (only the picker is highlighted)
- Changes to the buzz window, lockout, or round interstitial
- Making the lobby buzzer do anything visible on the TV (for example a "ready" ping)
- A timer that picks or passes control for a connected controller who doesn't pick
- Portrait layout for the host device, and phone layouts in landscape
- Daily Doubles, Final Jeopardy, host overrides of verdicts (features 2 and 3)
