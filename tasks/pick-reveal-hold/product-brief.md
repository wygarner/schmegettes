---
jira-type: enhancement
jira-title: "Pick card holds 0.75 s longer"
---
**Task Type:** Enhancement. A timing change to the existing pick reveal.

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md` ("Reading and buzzing", "The narrator's voice") and `interaction-design.md` (timing table, pick reveal).

**Problem:** Prod QA (2026-11-19): after a clue is picked, the "VOLCANOES / $400" card on the TV is gone before the room has read it. It holds only 0.3 s before turning into the clue screen.

**Outcomes:** The room can read the category and value of every pick. The reveal stays a fixed length that never waits on the narrator or the network.

**Player flow:**
- A pick starts the reveal on the TV: the cell blinks 3× (0–0.6 s), grows into the centered card (0.6–1.2 s), then **the card holds still for 1.05 s** (1.2–2.25 s; was 0.3 s). At **2.25 s** (was 1.5 s) the card becomes the clue header and the narrator starts reading.
- Reduced motion: the card fades in and holds for the same 2.25 s.
- Phones: buzzer `dim` from the pick; "Volcanoes for $400" for the full 2.25 s, then "Listen…".
- **Early buzz:** a buzz during the longer reveal is still an early buzz (250 ms lockout), as today.
- **Server timing moves with it:** the reading's earliest end and the fallback estimate both start 2.25 s after the pick (fallback: 2.25 s + ~2.5 words/s + 1 s). A `reading_done` before the reveal ends still waits for it.
- **Narrator:** prepares the clue during the reveal, now with 0.75 s more time; the first word is still heard within 1 s of the clue appearing.
- **Unchanged:** the Daily Double (0.6 s blink, then its own 2 s reveal), Final, a re-read after a pause (no reveal), and the host device disconnecting during the reveal (on return, the clue screen at once).

**Success Criteria:**
- On the TV, the card is fully grown and still for ≥ 1 s before the clue appears; the clue appears 2.25 s (±0.1 s) after the pick.
- A buzz during the hold gets the early-buzz lockout; buzzing never opens before 2.25 s + the reading.
- With speech failing, buzzing opens on the fallback (2.25 s + estimate).
- A Daily Double's timing is unchanged.

**Out of scope:** making the hold configurable; changing the blink, grow or Daily Double timings; any sound during the reveal.
