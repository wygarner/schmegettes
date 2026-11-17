---
jira-type: enhancement
jira-title: "Schmegettes voices: free Piper narrators the host picks, generated on the host device"
---
**Task Type:** Enhancement. It changes the voice of the existing narration; the built-in voice picker (#119) stays as the fallback.

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md` (The narrator's voice), `gameplay/interaction-design.md` (edge cases), `docs/product-docs/features/lobby/feature-brief.md` and `lobby/interaction-design.md` (picker row, download states, edge cases). New behavior is marked **Not yet implemented** there.

**Problem:** The narrator sounds only as good as the voices installed on the host device. On most iPhones that's a flat, robotic voice unless the host has downloaded a Premium voice in Settings, which few will do. We want one good voice for every room, at no cost and with no server to run.

**Outcomes:**
- Every host device narrates with the same natural-sounding voice by default.
- It costs nothing: an open-source voice generated on the host device, with no paid service and no server.
- The game never waits for the voice and never loses narration because of it: the built-in voice covers every gap.
- Timing and fairness are unchanged: buzzing never opens mid-reading, and the host's own buzzer never lags.

**The voices (decided):** the host picks one of three Piper voices, all about 63 MB, all with model cards that say "public domain" and none trained from the research-only lessac voice:

| Voice | Model | Sounds | Notes |
|---|---|---|---|
| **Kristin** (default) | `en_US-kristin-medium` | US, female | LibriVox recordings, "Trained from scratch" |
| **Norman** | `en_US-norman-medium` | US, male | LibriVox recordings, "Trained from scratch" |
| **John** | `en_US-john-medium` | US, male | LibriVox recordings, fine-tuned from Kristin |

Keep the list in one place so adding or swapping a voice is a small change. **Never** add a voice whose card says non-commercial (NC), points to the lessac license, or is fine-tuned from lessac or Ryan.

**Player flow:**
- **Host lobby opens** → the chosen Schmegettes voice (Kristin unless the host picked another) starts downloading in the background, if it isn't on the device already (host device only; phones never download). The lobby button reads "🔊 Kristin · 40%" until ready. The browser keeps it; later visits load it from storage in seconds.
- **Picker:** a "Schmegettes voices" group comes first (Kristin, Norman, John), then "Voices on this device" as today. Each Schmegettes row shows its state: "Downloading… 40%", "Couldn't download" + **Try again**, or "Not available on this device".
- **Picking another Schmegettes voice** selects it and starts its download; its sample plays once ready. Until then the voice already on the device keeps reading. Once the new voice is ready, the old one is removed: **the device keeps one Schmegettes voice at a time** (about 63 MB). Picking a second voice before the first finishes cancels the first download.
- **Default:** Kristin, unless the host saved a built-in voice (they keep it).
- **Start** is never held up. Until the voice is ready, the best built-in voice reads; it switches to Kristin at the next line once ready, never mid-line.
- **Each clue:** the short announcement ("Here's Volcanoes for 400.") plays while the clue is generated. First word within **1 s** of the clue appearing. The host device reports the end of the reading when the audio ends, as today.
- **Fallback per line:** a line not started **1.5 s** after it should have, or failing, is read with the built-in voice. After **2** such lines in a row, the built-in voice reads for the rest of the game.
- **Sound blocked on iOS** (no tap yet): same "tap to turn on sound" handling as today; the first tap unlocks the Schmegettes voice too.
- **Edge cases** (full list in the interaction designs): download fails → built-in voice, **Try again**, auto-retry next lobby; storage cleared by iOS → downloads again; host device reloads mid-game → built-in voice until loaded from storage; device too slow to generate → "Not available on this device", tip shown.

**Timing rule:** buzzing must never open before the reading ends. The server's fallback estimate (2.5 words/s + 1 s, at most 14 s) starts when the clue is picked, so generation time counts against its 1 s margin. **Decided (approved 2026-11-17):** if the on-device measurement shows the margin isn't enough, engineering raises it to 2 s (and the 14 s cap to 15 s) in `game/`, and updates the reading rule in the gameplay docs to match. The estimate only decides timing when the narration fails to report or runs long, so a longer margin only delays those rooms.

**Success Criteria:** measured on the host iPhone, in Safari, mirrored to the TV:
- Fresh device: Kristin downloads in the lobby (one download of about 63 MB), and later visits load it without downloading again.
- Each of Kristin, Norman, and John can be picked, downloads, plays its sample, and narrates a game. After switching, only the new voice is stored on the device (check the site's storage size).
- Switching voices in the lobby never leaves the narrator silent: the previous voice reads until the new one is ready.
- 20 clues of mixed length (one near 14 s): the first word within 1 s of the clue appearing, and the buzzer never lights before the reading ends.
- A full game (Single, Double, Daily Doubles, Final, about 60 clues) completes without the page reloading or the narrator going silent.
- With the host playing, tapping the host's buzzer while a clue is being generated feels as instant as without the Schmegettes voice. Engineering defines the measure (for example, main-thread blocking under 50 ms).
- Kill the network mid-download, or block storage: the game narrates with the built-in voice throughout, and Start works.
- Phones never download the voice. No paid service, API key, or new server is involved.

**Out of scope:**
- Voices beyond Kristin, Norman, and John; voice cloning; a custom-trained voice
- Players choosing a voice (only the host picks, in the lobby)
- Keeping several Schmegettes voices on the device at once
- Generating speech on a server (the worker) or storing audio
- Kokoro or other larger models (revisit if Piper on the iPhone falls short)
- Speed, pitch, or volume settings
- Offline play
