---
jira-type: enhancement
jira-title: "Schmegettes voice: a free Piper narrator generated on the host device"
---
**Task Type:** Enhancement. It changes the voice of the existing narration; the built-in voice picker (#119) stays as the fallback.

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md` (The narrator's voice), `gameplay/interaction-design.md` (edge cases), `docs/product-docs/features/lobby/feature-brief.md` and `lobby/interaction-design.md` (picker row, download states, edge cases). New behavior is marked **Not yet implemented** there.

**Problem:** The narrator sounds only as good as the voices installed on the host device. On most iPhones that's a flat, robotic voice unless the host has downloaded a Premium voice in Settings, which few will do. We want one good voice for every room, at no cost and with no server to run.

**Outcomes:**
- Every host device narrates with the same natural-sounding voice by default.
- It costs nothing: an open-source voice generated on the host device, with no paid service and no server.
- The game never waits for the voice and never loses narration because of it: the built-in voice covers every gap.
- Timing and fairness are unchanged: buzzing never opens mid-reading, and the host's own buzzer never lags.

**The voice (decided, pending a listen):** **Kristin**, Piper `en_US-kristin-medium`, about 63 MB. Its model card says "public domain" (LibriVox recordings) and "Trained from scratch", so it carries no restrictions from another voice. The house voice is one constant; changing it after a listen is a one-line change. Alternatives with clean licenses (model card says public domain or CC0, not trained from the research-only lessac voice): `en_US-norman-medium` and `en_US-john-medium` (male, public domain), `en_US-ljspeech-medium` (female, public domain), `en_US-joe-medium` and `en_US-kathleen-medium` (CC0). **Never** use a voice whose card says non-commercial (NC), points to the lessac license, or is fine-tuned from lessac or Ryan.

**Player flow:**
- **Host lobby opens** → the voice starts downloading in the background (host device only; phones never download). The lobby button reads "🔊 Kristin · 40%" until ready. The browser keeps the voice; later visits load it from storage in seconds.
- **Picker:** "Kristin (Schmegettes voice)" is the first row, with its state ("Downloading… 40%", "Couldn't download" + **Try again**, "Not available on this device"), then the device's voices as today. It can be picked while downloading; its sample plays once ready.
- **Default:** the Schmegettes voice, unless the host saved a built-in voice (they keep it).
- **Start** is never held up. Until the voice is ready, the best built-in voice reads; it switches to Kristin at the next line once ready, never mid-line.
- **Each clue:** the short announcement ("Here's Volcanoes for 400.") plays while the clue is generated. First word within **1 s** of the clue appearing. The host device reports the end of the reading when the audio ends, as today.
- **Fallback per line:** a line not started **1.5 s** after it should have, or failing, is read with the built-in voice. After **2** such lines in a row, the built-in voice reads for the rest of the game.
- **Sound blocked on iOS** (no tap yet): same "tap to turn on sound" handling as today; the first tap unlocks the Schmegettes voice too.
- **Edge cases** (full list in the interaction designs): download fails → built-in voice, **Try again**, auto-retry next lobby; storage cleared by iOS → downloads again; host device reloads mid-game → built-in voice until loaded from storage; device too slow to generate → "Not available on this device", tip shown.

**Timing rule:** buzzing must never open before the reading ends. The server's fallback estimate (2.5 words/s + 1 s, at most 14 s) starts when the clue is picked, so generation time counts against its 1 s margin. **Assumption:** if the on-device measurement shows the margin isn't enough, engineering may raise it to 2 s (and the 14 s cap to 15 s). The estimate only decides timing when the narration fails to report or runs long, so a longer margin only delays those rooms.

**Success Criteria:** measured on the host iPhone, in Safari, mirrored to the TV:
- Fresh device: the voice downloads in the lobby (one download of about 63 MB), and later visits load it without downloading again.
- 20 clues of mixed length (one near 14 s): the first word within 1 s of the clue appearing, and the buzzer never lights before the reading ends.
- A full game (Single, Double, Daily Doubles, Final, about 60 clues) completes without the page reloading or the narrator going silent.
- With the host playing, tapping the host's buzzer while a clue is being generated feels as instant as without the Schmegettes voice. Engineering defines the measure (for example, main-thread blocking under 50 ms).
- Kill the network mid-download, or block storage: the game narrates with the built-in voice throughout, and Start works.
- Phones never download the voice. No paid service, API key, or new server is involved.

**Out of scope:**
- More than one Schmegettes voice, voice cloning, or a custom-trained voice
- Generating speech on a server (the worker) or storing audio
- Kokoro or other larger models (revisit if Piper on the iPhone falls short)
- Speed, pitch, or volume settings
- Offline play
