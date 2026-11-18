---
jira-type: enhancement
jira-title: "Game options in the lobby: seasons, timers, Double Schmegettes on/off"
---
**Task Type:** Enhancement to the lobby (room settings were listed as out of scope; the API already takes seasons).

**Product docs:** `docs/product-docs/features/lobby/feature-brief.md#game-options`, `features/lobby/interaction-design.md` (Game options sheet, edge cases), `features/gameplay/feature-brief.md` (buzz and answer windows; rounds), `features/gameplay/interaction-design.md` (Timing), `features/wagers/feature-brief.md` (who plays Final), `features/clue-catalog/feature-brief.md`.

**Problem:** Every game is the same length and pace, with clues from every season. Hosts want shorter games, easier pacing for casual rooms, or clues from the years they know.

**Outcomes:** The host sets seasons, timer pace, and whether to play Double Schmegettes, before Start.

**Player flow:**
- **⚙ Options** in the host lobby opens a sheet (fits 844 × 390, no scrolling):
  - **Seasons:** two-handle range slider, 1 (1984) to 40 (2024), at least one season. Default all.
  - **Timers:** Relaxed (15 s to buzz, 12 s to answer) · **Standard** (9 s, 9 s) · Fast (5 s, 7 s). Default Standard. Only the buzz window (and each reopen) and the answer time change; wager/Final 30 s, reading and the 250 ms lockout don't. Daily Double answers use the answer time.
  - **Double Schmegettes:** On (default) / Off. Off: Single board (1 Daily Double), then Final; Final players are those above $0 when the Single board ends.
- Changes apply at once; the line under the room code lists the non-default options ("Seasons 20–40 · Fast timers · No Double Schmegettes"). Phones don't show them.
- Host device only, lobby only; locked at **Start**, enforced by the server.
- The host device remembers the last options for its next room (like the voice). **Rematch** keeps the room's options; the host can change them before Start.
- Narrow seasons can run out of fresh categories; the board falls back to least-recently-seen ones as today. The game always starts.

**Success Criteria:**
- A game started with Fast timers opens 5 s buzz windows and 7 s answer windows; Relaxed 15 s / 12 s; Standard unchanged.
- With Double off, the game goes from the last Single clue straight to Final (no interstitial), and the recorded game has one board.
- A board built for seasons 20–40 uses only categories from those seasons (or the fallback when fresh ones run out).
- Options can't change after Start (server rejects), and only the host can change them.
- A new room on the same device starts with the last options used.

**Out of scope:** max players, number of categories, custom timer values, options mid-game, showing options on phones.
