---
jira-type: enhancement
jira-title: "Ask for the microphone first and block play until it's allowed"
---
**Task Type:** Enhancement to joining (lobby) and gameplay. Today the phone asks for the microphone in the lobby and lets a player without one play on (a buzz then counts as no answer).

**Product docs:** `docs/product-docs/features/gameplay/interaction-design.md#microphone-permission` (rewritten), `features/lobby/feature-brief.md` (Joining; Join the game), `features/lobby/interaction-design.md` (Join flow, edge cases), `features/wagers/interaction-design.md`, `features/rejoin-games/interaction-design.md`.

**Problem:** A player who skips or misses the microphone prompt finds out mid-game, when their buzz turns into a wrong answer. A permission prompt mid-clue costs them the clue.

**Outcomes:** Every contestant (a playing host included) has a working microphone before they're in the room. No permission prompt ever appears during a game.

**Player flow:**
- **Phone:** code accepted → **microphone screen** ("You answer out loud, so Schmegettes needs your microphone." **Allow microphone**, **Leave**) → name → "You're in". The player isn't added to the room until both are done.
- **Allow microphone** triggers the same listening answering uses, so on iPhone both the microphone and speech-recognition permissions are granted here.
- **Blocked / Don't Allow:** "Your microphone is blocked." with steps for the browser (iPhone Safari: aA → Website Settings → Microphone → Allow; Chrome: site icon → Microphone → Allow) and **Try again**. No way to continue without it; only **Leave**.
- **No speech recognition in the browser:** stop screen "This browser can't hear answers. Open {site} in Safari or Chrome." with **Leave**.
- **Host device:** hosting needs no microphone. **Join the game** shows the same screen first; the host is added only once it's allowed. Blocked: **Cancel** returns to a non-playing host.
- **Asked again** (iPhone Safari can ask on each visit): a reload or Rejoin shows the screen before the player is back in their seat; meanwhile their tile shows "(reconnecting)".
- **Turned off mid-game:** the screen covers that phone and the player counts as disconnected (no buzzing; control passes after 10 s; a Daily Double answer is no answer) until it's allowed again.
- Removed: the lobby's "Allow the microphone so you can answer" prompt, the second ask at Start, the "Turn on the microphone to answer" warning before every clue, and "a buzz with no microphone counts as no answer".

**Success Criteria:**
- On iPhone Safari and Android Chrome, a new player can't reach the name step, appear on the TV or be counted toward Start without allowing the microphone.
- After allowing it, a full game (spoken pick, answers, a Daily Double) shows no permission prompt.
- Denying shows the blocked screen; fixing it in settings and pressing **Try again** continues to the name.
- A host who presses Join the game and denies stays a non-playing host.
- A reload mid-game on iPhone Safari goes through the screen (if asked again) and back to the same seat and score.

**Out of scope:** typed answers as an alternative, spectators, a microphone test or level check on the screen.
