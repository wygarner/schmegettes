---
jira-type: new-feature
jira-title: "Sound effects: correct and time's-up stings, Daily Double, Double Schmegettes, buzzer press"
---
**Task Type:** New Feature. The game has no sound effects today; gameplay and wagers listed them as out of scope.

**Depends on:** `clue-pacing` (the sting goes before the correct-response line, whose new timing that task sets). Can be built in parallel if it slots into the existing 6 s screen and is adjusted after.

**Product docs:** `docs/product-docs/features/sound-effects/feature-brief.md` and `interaction-design.md` (new); references in `features/gameplay/*` and `features/wagers/feature-brief.md`.

**Problem:** The big moments are silent (Daily Double, "Double Schmegettes!", whether a clue was got). And the buzzer seems to make a sound only some of the time. QA (2026-11-18) saw it on first press, then never, then again. That's iOS's own dictation chime when the microphone starts, which is muted while the narrator talks. It isn't ours.

**Outcomes:**
- The room hears the big moments.
- Every buzzer press that does something makes the same sound.

**Player flow:**
- **TV (host device):** before "Correct, …", a bright two-note chime (≤0.8 s); before "Sorry, we were looking for …", a low time's-up tone (≤0.8 s); with "DAILY DOUBLE", a rising flourish (≤1.5 s) before "It's a Daily Double."; with "Double Schmegettes!", a fanfare (≤2.5 s) inside the 3 s.
- **Buzzer press:** a short thunk (≤0.2 s) on the pressing device only, the moment the finger lands, on presses that do something: an early buzz in `dim`, a buzz in `lit`, the press that starts a spoken pick. Nothing on `idle`, `locked`, `answering`.
- Sounds never overlap the narrator (the line waits for the sound) and never extend a timing: the correct-response 6 s cap, the 2 s Daily Double reveal and the 3 s interstitial stay.
- Nothing for a wrong answer mid-clue, buzzing opening, or the pick reveal.
- Mixed a little below the narrator; no volume or mute setting.
- A sound that fails is skipped silently; nothing waits for it. "Tap to turn on sound" unlocks sounds and narrator together; a phone's first press unlocks its own sound.
- **Assets:** original or CC0 only, none imitating a TV quiz show's cues; all together well under 1 MB, loaded with the app; licenses added to the third-party notices.

**Success Criteria:**
- Each sound plays at its moment on an iPhone host device and in desktop Chrome, and the narrator's line starts after it ends.
- A phone plays the thunk on every press in `dim`, `lit` and `pick`, including after the TV has narrated (the QA sequence: press to pick, clue read, buzz → thunk every time).
- Timings in `game/` are unchanged by this task.
- A missing sound file doesn't change any timing or show an error.

**Out of scope:** music and a Final "think" tune, a TV sound per buzz, volume/mute settings, haptics, silencing iOS's dictation chime.
