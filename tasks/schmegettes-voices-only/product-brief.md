---
jira-type: enhancement
jira-title: "Narrator uses only the Schmegettes voices; Start waits for the voice"
---
**Task Type:** Enhancement to gameplay's narrator and the lobby's voice picker (an existing feature changes how it chooses voices).

**Depends on:** `schmegettes-voices-prod`. Without that fix, removing the device voices leaves production silent.

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md#the-narrators-voice`, `features/gameplay/interaction-design.md` (edge cases), `features/lobby/feature-brief.md` (Voice, Start) and `features/lobby/interaction-design.md` (voice picker, edge cases).

**Problem:** The device's built-in voices sound worse than the Schmegettes voices and differ from device to device. QA (2026-11-18): "Do not allow device narrators."

**Outcomes:**
- Every game is narrated in a Schmegettes voice (Kristin, Norman or John), on every host device.
- The host never sees or picks a device voice.

**Player flow:**
- **Picker:** lists only Kristin, Norman and John. The "Voices on this device" section and the "download a Premium voice" tip are gone.
- **Start waits for the voice.** Until the picked voice is ready on the host device, Start is disabled and reads "Getting Kristin ready… 40%". When it's ready, Start enables (if 2 contestants are in). A failed download: "Couldn't download the voice" with **Try again**, Start stays disabled.
- **Device that can't run the voices:** the lobby says "This device can't run the Schmegettes narrator. Host from a recent iPhone, iPad or computer." The 🔊 button is hidden and Start stays disabled.
- **Mid-game, a line that isn't ready** (not started 1.5 s after it should have, or an error) is skipped silently: the text stays on screen, and for a clue buzzing opens on the server's fallback estimate. The next line tries the voice again. No built-in voice ever stands in; the "2 failures in a row → built-in for the rest of the game" rule is removed.
- **Host device reloads mid-game:** the voice loads from browser storage; lines before it's ready are skipped silently.
- **Saved built-in voice from before:** the device gets Kristin, without a message.
- **Sound unlock** ("Tap to turn on sound") still works; it must not depend on the device's speech synthesis.

**Success Criteria:**
- No code path speaks with `speechSynthesis` during a game or a sample.
- Start is disabled while the voice downloads, after a failed download, and on a device that can't run the voices; it enables the moment the voice is ready.
- A forced failure of one line in a game skips that line, opens buzzing on the fallback timer, and the next line plays in the Schmegettes voice.
- A device with a saved built-in voice choice lands on Kristin.

**Out of scope:** new voices, a speed setting, changing the voice mid-game.
