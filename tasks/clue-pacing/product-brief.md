---
jira-type: enhancement
jira-title: "Pick reveal animation instead of the spoken announcement; shorter wait after the correct response"
---
**Task Type:** Enhancement to gameplay. Two timing changes to the clue loop from QA (2026-11-18): the start of a clue (the pick) and its end (after the correct response is read).

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md` (Reading and buzzing; Answering and judging), `features/gameplay/interaction-design.md` (Timing, Pick reveal, Correct response, flows, edge cases), `features/wagers/feature-brief.md` (Daily Double reveal and After), `features/scoreboard-and-overrides/feature-brief.md` (clock pauses during review).

**Problem:**
- "Here's Volcanoes for 400." is slow and repeats what the board already shows.
- After the correct response is read, the TV holds for the rest of a fixed 6 s, which feels like dead air.

**Outcomes:**
- A pick feels instant and visual; the narrator reads only the clue.
- The board comes back as soon as the correct response has been read.

**Player flow:**
- **Pick reveal, 1.5 s, always.** 0–0.6 s: the picked cell blinks three times (value flashes `yellow.4` ↔ white). 0.6–1.5 s: the cell lifts and grows into a centered card (about 60% of the stage's width) with the category and value ("VOLCANOES", "$400"); the board dims behind it; the card holds for the last 0.3 s. At 1.5 s the card shrinks into the clue screen's header and the clue appears. Reduced motion: the card fades in over the same 1.5 s.
- **No spoken announcement.** The narrator reads only the clue, starting at 1.5 s. It prepares the clue during the reveal; the first word is heard within 1 s of the clue appearing.
- **Buzzer:** dim from the pick; a buzz during the reveal is an early buzz (250 ms lockout). Phones show "Volcanoes for $400" during the reveal, then "Listen…".
- **Server fallback** for opening buzzing: 1.5 s + the clue-only reading estimate (2.5 words/s + 1 s, reading part at most 14 s).
- **Daily Double:** blink 0.6 s, then the existing 2 s "DAILY DOUBLE" reveal (no category card).
- **Host device disconnects** during the reveal or the reading: on return the clue is read from the start with no reveal.
- **Correct response:** the narrator's line ("Correct, …" / "Sorry, we were looking for …"), then the board returns **1 s after the line ends**. The host device reports the line's end as it does for clues. Cap: 6 s after the clue ended if the report never comes. (A sound before the line comes in `sound-effects`; leave room for it in the sequence.)
- **Host override review** during the correct-response screen holds the screen; the countdown to the board resumes when the review closes.

**Success Criteria:**
- The reveal takes 1.5 s ± one frame on the host device at 844 × 390 and at 667 × 320, and never waits on speech or the network.
- No "Here's {category} for {value}" line is spoken anywhere; the announcement helpers in `game/` and `web/` are removed.
- Buzzing opens when the clue's reading ends, or at the new fallback.
- With a correct-response line of about 2.5 s, the board returns about 3.5 s after the clue ended (was 6 s). With no end-of-line report, at 6 s.
- Daily Double and override timing behave as above.

**Out of scope:** sound effects (`sound-effects`), changing the 9 s buzz/answer windows (`lobby-game-options`).
