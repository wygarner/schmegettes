---
task-type: bug-fix
task-title: "The host device gets its sound back after an app switch or interruption, and the game waits for it"
---
**Task Type:** Bug Fix, with one behaviour change Wyatt asked for: "Sound should be enforced for host". QA (production, 2026-11-28): "Lost sound after host switched apps", "Randomly losing sound."

**Product docs:** `docs/product-docs/features/sound-effects/feature-brief.md` (Sound unlocking), `features/gameplay/feature-brief.md` (Fairness and disconnects, new row). Both are updated in the qa-2026-11-28 docs change.

**Problem:** Nothing turns the host device's sound back on after it has stopped. iOS suspends or interrupts a page's audio when the host switches apps, takes a call, uses Siri or gets an alarm. The narrator and sounds only try to resume when they next play, and outside a tap iOS usually refuses. The line is then skipped silently (`narrator_line_skipped`, reason `no_audio_context`), so the room loses the narrator for the rest of the game without knowing why.

**Outcomes:** The TV never plays on silently. Either sound comes back by itself, or the game waits for one tap from the host.

**Player flow:**
- **Host comes back to the page** (`visibilitychange` to visible, `pageshow`) or **audio is interrupted** (audio context `suspended` or `interrupted`): the host device tries to resume audio at once.
- **It resumes:** nothing visible happens. A line that was skipped while away isn't replayed, except the clue rule below.
- **It can't resume without a tap:** the host device tells the server, and the game **pauses** exactly as for a host disconnect: timers stop, buzzers go dim, phones show the paused state. The TV shows a full-stage **Tap to turn on sound** with "The game is paused until sound is back on." One tap anywhere resumes audio and the game. A clue being read is read again from the start (as after a disconnect). Daily Double and Final timers resume with the time they had left.
- **While the page is hidden**, the host device counts as disconnected, as today if its socket drops. When it comes back, the rule above applies.
- **The narrator skips a line for no audio** mid-game (outside the two triggers above): same as "can't resume": pause and ask for the tap.
- **Phones** never pause the game for sound. A phone that lost sound gets it back at its next buzzer press, as today.
- **Lobby:** no pause, since there is no game. The lobby shows **Tap to turn on sound** above Start when audio is off, and Start waits for it.
- After 30 minutes paused for sound, the same rule as a 30-minute host disconnect applies (the game is abandoned and can be resumed).

**Success Criteria:**
- On an iPhone host (Safari), switching to another app for 10 s and back mid-game: either the narrator reads the next line, or the game is paused with Tap to turn on sound. Never a game running with no sound. Checked on a real iPhone (agent-qa.md human checklist).
- A unit test simulates the audio context going `interrupted`, then `resume()` rejecting: the host device sends the pause and shows the overlay. A tap resumes.
- The server's pause and resume for "host sound off" reuse the host-disconnect pause, with the same timer behaviour. Game server tests cover pause and resume during `reading`, `buzzing_open`, `answering` and the Daily Double wager.
- `narrator_line_skipped` with `no_audio_context` drops to near zero in production (Grafana, a week after release).

**Decisions made:** pause the game (not just show a banner) when the host device has no sound. This was recommended in chat on 2026-11-28 and matches "sound should be enforced for host".

**Out of scope:** phones' sound, volume controls, a mute setting.
