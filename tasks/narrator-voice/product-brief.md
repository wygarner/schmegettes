---
jira-type: enhancement
jira-title: "Narrator uses the best installed voice, and the host can change it"
---
**Task Type:** Enhancement. It improves the existing narration in gameplay; no new feature or server behavior.

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md` (The narrator's voice), `gameplay/interaction-design.md` (edge cases), `docs/product-docs/features/lobby/feature-brief.md` and `lobby/interaction-design.md` (Voice button, Narrator voice picker, edge cases).

**Problem:** The TV reads every clue with the browser's default voice, because `web/src/lib/speech.ts` never chooses one. On the host iPhone that's usually a flat, robotic voice, even when a far better one is installed. The narrator is the voice of the whole game, so it should sound as good as the device allows.

**Outcomes:**
- With no setup, the narrator uses the best English voice installed on the host device.
- The host can hear the available voices and pick one in the lobby.
- A host who has only basic voices learns how to get a better one.
- No cost, no server or contract change, and game timing unchanged.

**Player flow:**
- **Automatic choice** (host device only; phones never speak): the best English voice. In order: Premium, then Enhanced, then other US English, then other English; within a group, the device's default voice first. Novelty voices (singing, whispering, robot effects such as Apple's Bells, Whisper, Zarvox) are never used or listed.
- **Lobby:** a subtle **🔊 {voice name}** button on the bottom row, between Join/Leave the game and Start. It opens a **Narrator voice** modal: English voices best first, the current one checked; each row shows name, quality ("Premium", "Enhanced"), and region if not US ("UK"). Tapping a row selects it and says "Here's Volcanoes for 400." in it on the TV. **Done** closes it.
- **Tip** (in the modal, only when no Premium or Enhanced voice is installed, only on Apple devices): "Want a more natural voice? Download a Premium voice in Settings → Accessibility → Spoken Content → Voices → English, then reload this page." The Mac version names System Settings.
- **Saved on the device** (not the account, not the server) for every room it hosts. Lobby only: once the game starts the voice is fixed, and it speaks every line (announcement, clue, Daily Double, Final, correct response).
- **Pace:** every voice at its normal rate (rate 1). No speed setting.
- **Edge cases** (full list in the interaction designs):
  - Voice list loads late → the button reads "🔊 Default voice" until it arrives; a clue reading never waits for the list.
  - Saved voice removed from the device → best voice, without a message.
  - No English voice → device default; picker says "No English voices on this device." with the tip.
  - Device can't speak → no button; clues silent as today.
  - Second voice tapped during a sample → first stops; Start during a sample → sample stops, picker closes, selection kept.
  - iOS sound not unlocked yet → the tap on a row unlocks it, so the sample plays.

**Success Criteria:**
- On an iPhone with a Premium English voice downloaded, a fresh host device (nothing saved) narrates with that voice without opening the picker.
- On an iPhone with no Premium or Enhanced voice, narration uses the best remaining voice, and the picker shows the tip.
- Picking a voice plays the sample on the TV, and the whole game then uses it for every line. The choice survives a reload and a new room on the same device.
- No novelty voice appears in the picker or is ever chosen automatically.
- **Timing check:** on the target iPhone, with the voice chosen automatically and with each Premium/Enhanced English voice, 20 clues of different lengths each finish reading before the server's fallback estimate (2.5 words/s + 1 s, at most 14 s). In other words, buzzing never opens mid-clue.
- Phones, the server, and `shared/` contracts are unchanged.

**Out of scope:**
- Cloud or recorded voices (options B and C from the discussion): revisit if built-in voices still sound flat
- Speed, pitch, or volume settings
- Changing the voice mid-game
- Saving the voice to the account or syncing it across devices
- Phones speaking
- Sound effects and music
