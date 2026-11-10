---
jira-type: enhancement
jira-title: "Narrator uses the best installed voice, and the host can change it"
---
# Task spec: narrator-voice

Product brief: `tasks/narrator-voice/product-brief.md`. Rules: `docs/product-docs/features/gameplay/feature-brief.md#the-narrators-voice`, lobby picker: `docs/product-docs/features/lobby/interaction-design.md#narrator-voice-picker-host-device`.

**Scope:** `web/` only. Every narrated line (announcement, clue, Daily Double, Final, correct response, "Sound on") already goes through `speak()` in `web/src/lib/speech.ts`, so choosing the voice there covers the whole game. No server, contract, or database change.

## Subtasks

### 1. Voice ranking and storage: `web/src/lib/narratorVoice.ts` (new)

Pure functions over the browser's `SpeechSynthesisVoice` list, plus guarded storage. No React.

- `voiceQuality(v): "premium" | "enhanced" | "standard"`. Apple puts the quality in `voiceURI` (`com.apple.voice.premium.en-US.Ava`, `com.apple.voice.enhanced.en-US.Evan`, `com.apple.voice.compact.en-US.Samantha`); macOS also puts it in `name` ("Ava (Premium)"). Check the URI segment first, then the name. Anything else is `standard`.
- `isNovelty(v)`: true for Apple's novelty voices, matched by name with the quality suffix stripped: Albert, Bad News, Bahh, Bells, Boing, Bubbles, Cellos, Good News, Jester, Organ, Superstar, Trinoids, Whisper, Wobble, Zarvox. Keep the list as one exported constant with a comment linking the product rule.
- `englishVoices(voices)`: `lang` starts with `en` (case-insensitive, `en-US` and `en_US` both), not novelty.
- `rankVoices(voices)`: `englishVoices`, then sorted by group: premium → enhanced → standard `en-US` → other English. Within a group, `v.default` first, then by name. Stable.
- `voiceLabel(v)`: display name without any "(Premium)"/"(Enhanced)" suffix, then the quality in parentheses for premium/enhanced, then the region for non-US English: `en-GB` → UK, `en-AU` → Australia, `en-IE` → Ireland, `en-IN` → India, `en-ZA` → South Africa, `en-NZ` → New Zealand, `en-CA` → Canada, `en-SG` → Singapore, otherwise the raw region code. Examples: "Ava (Premium)", "Samantha", "Daniel (UK)", "Karen (Enhanced, Australia)".
- `chooseVoice(voices, savedURI): SpeechSynthesisVoice | null`: the saved voice if it's still in `englishVoices` (match on `voiceURI`), else `rankVoices(...)[0]`, else `null` (caller keeps the browser default).
- `hasNaturalVoice(voices)`: any English voice that's premium or enhanced (drives the tip).
- Storage, following `web/src/lib/accountFlags.ts` (every access in try/catch; blocked storage = not set): key `schmegettes.narratorVoice`, value = `voiceURI`. `getSavedVoice(): string | null`, `saveVoice(uri: string)`.
- `tipPlatform(): "ios" | "mac" | null`: iPhone/iPad in the user agent, or `MacIntel` with `navigator.maxTouchPoints > 1` (iPadOS) → `ios`; other Mac → `mac`; else `null`.

### 2. Speak with the chosen voice: `web/src/lib/speech.ts`

- `speak(text, voice?)`: `voice` overrides (for the lobby sample); otherwise `chooseVoice(synth.getVoices(), getSavedVoice())`, read **at call time** so a late voice list or a reload picks it up. When a voice is found, set `utterance.voice` and `utterance.lang = voice.lang`; when `null`, set nothing (today's behavior). `rate` stays 1. Never wait for the voice list: an empty `getVoices()` speaks at once with the default.
- `useNarratorVoices(): { voices: SpeechSynthesisVoice[]; supported: boolean }` (in `narratorVoice.ts` or a small hook file next to it, implementer's choice): `getVoices()` on mount, re-read on the `voiceschanged` event, and once more on the first `click` (iOS Safari doesn't always fire `voiceschanged`). `supported` is false when `window.speechSynthesis` or `SpeechSynthesisUtterance` is missing.
- Keep the existing iOS behavior intact: `SPEECH_START_TIMEOUT_MS`, the cancel-only-if-speaking rule, `unlockSpeech`.

### 3. Lobby button and picker: `web/src/pages/HostLobby.tsx`, `web/src/game/NarratorVoicePicker.tsx` (new)

- In the bottom row of the lobby stage, between the Join/Leave stack and the Start group: a subtle button `🔊 {label}` (`variant="subtle"`, `color="mauve.1"`, like the ✎ icon), `aria-label="Narrator voice: {label}"`. Label = `voiceLabel(chooseVoice(...))`, or "Default voice" while the list is empty. Not rendered when `supported` is false. It must fit at 667 × 320 without pushing Start off screen: truncate the label.
- The button opens a Mantine `Modal` titled "Narrator voice": `rankVoices(voices)` as a list (scrolls inside the modal), current one marked ✓ and `aria-selected`. Tapping a row: `saveVoice(uri)`, then `speak("Here's Volcanoes for 400.", voice)`. `speak()` already cancels a playing sample. The tap is a user gesture, so it also unlocks iOS speech (the `HostLayout` click listener runs `unlockSpeech` too).
- No English voices: the list is replaced by "No English voices on this device."
- Tip below the list when `!hasNaturalVoice(voices)` and `tipPlatform()` isn't null:
  - ios: "Want a more natural voice? Download a Premium voice in Settings → Accessibility → Spoken Content → Voices → English, then reload this page."
  - mac: "Want a more natural voice? Download a Premium voice in System Settings → Accessibility → Spoken Content → System voice → Manage Voices, then reload this page."
  - Keep both strings as constants so the path is a one-line fix after the on-device check (manual check 2).
- **Done** and clicking outside close it.
- Start: call `stopSpeaking()` in the Start `onClick` before `send`. The modal goes away with the lobby view when the phase leaves `lobby`; also close it in an effect on `state.phase` so a rematch lobby never reopens with it.

### 4. Docs

Remove the **Not yet implemented** markers this task fulfills (list under "Docs to update"). Correct any detail that changed during implementation (labels, tip text).

## Key files

| Subtask | Files |
|---|---|
| 1 | `web/src/lib/narratorVoice.ts` (new), `web/src/lib/narratorVoice.test.ts` (new) |
| 2 | `web/src/lib/speech.ts`, `web/src/lib/speech.test.ts` |
| 3 | `web/src/pages/HostLobby.tsx`, `web/src/pages/HostLobby.test.tsx`, `web/src/game/NarratorVoicePicker.tsx` (new) |
| 4 | the docs under "Docs to update" |

Read, don't change: `web/src/game/HostGame.tsx` (calls `speak`, reports `reading_done`), `web/src/game/HostLayout.tsx` (unlock listener), `game/internal/play/game.go` (`ReadingTime`, `MaxReading`).

## Contracts preserved

- `shared/`: unchanged. The voice is per device and never sent to the server.
- WebSocket: unchanged. `reading_done` is still sent only when speech really ended.
- Server timing: unchanged (`ReadingTime` = 1 s + words / 2.5, at most 14 s). See "Timing decision".
- Phones: unchanged; they never speak.

## Timing decision

Product asked: if a Premium voice reads slower than the server's estimate, rank it lower or loosen the estimate?

**Recommendation: neither in this task; measure first.** Apple's Premium/Enhanced voices at rate 1 typically speak about 2.5–3 words a second, and the estimate adds 1 s on top, so they should fit. The implementation PR reports the on-device measurement (manual check 3). If a voice misses the estimate, the PR says which one and by how much, and the fix becomes a separate task. Loosening the estimate is a `game/` change that delays buzzing for every room whose narration fails, so it shouldn't ride along with a web-only change. A per-voice speed setting would contradict the product rule "every voice at its normal pace".

## Success criteria

From the product brief, made testable:

1. Nothing saved, a Premium English voice installed → `speak()` uses it (unit test with fake voices; manual check 1 on iPhone).
2. No Premium/Enhanced voice → the best remaining voice by the ranking; the picker shows the tip on Apple devices only.
3. Picking a voice saves it and plays "Here's Volcanoes for 400." in it; every later `speak()` uses it; it survives reload (storage) and a new room.
4. Saved voice missing from the list → best voice, no message.
5. Novelty and non-English voices never listed, never chosen.
6. Empty voice list → `speak()` speaks at once with the default; the button reads "Default voice" and updates on `voiceschanged`.
7. No `speechSynthesis` → no button; clues behave as today.
8. Start stops a playing sample.
9. Timing: manual check 3 passes, or the PR reports which voice misses.
10. No change under `shared/`, `game/`, `api/`, `supabase/`.

## Test plan

Write with Vitest + Testing Library, faking `speechSynthesis.getVoices()` the way `speech.test.ts` fakes `speak`. Fake voices are plain objects `{ name, lang, voiceURI, default, localService }`.

**`web/src/lib/narratorVoice.test.ts` (new)**
- Quality from URI (`.premium.`, `.enhanced.`, `.compact.`) and from name suffix; URI wins when both exist.
- Ranking: premium > enhanced > standard en-US > other English; default first within a group; `en_US` underscore form accepted; `fr-FR` excluded; Bells, Zarvox, Whisper excluded.
- Labels: "Ava (Premium)" (suffix not doubled when the name already has it), "Daniel (UK)", "Karen (Enhanced, Australia)".
- `chooseVoice`: saved and present → saved; saved but removed → best; saved but non-English or novelty → best; empty list → `null`.
- Storage: blocked `localStorage` (getter throws) → `getSavedVoice()` is `null` and `saveVoice` doesn't throw.
- `tipPlatform` for an iPhone UA, an iPad-as-Mac UA with touch points, a Mac UA, and a Windows UA.

**`web/src/lib/speech.test.ts` (extend)**
- With voices and nothing saved, the utterance gets the top-ranked voice and its `lang`; `rate` stays 1.
- With a saved voice, the utterance gets it.
- An explicit `voice` argument wins over the saved one.
- With `getVoices()` returning `[]`, `utterance.voice` stays unset and speech starts immediately.
- Existing tests still pass (start timeout, cancel rule, unlock).

**`web/src/pages/HostLobby.test.tsx` (extend)**
- The button shows the chosen voice's label; "Default voice" with an empty list; updates after a `voiceschanged` event.
- No `speechSynthesis` → no button.
- Opening the picker lists voices in rank order with the current one selected; tapping a row saves it (storage) and speaks the sample with that voice.
- Tip appears with only standard voices on an iPhone UA, and not when a Premium voice exists or on a non-Apple UA.
- No English voices → "No English voices on this device."
- Start calls `speechSynthesis.cancel()` while a sample is playing.

**Commands (targeted only):**

```bash
mise run test:web -- src/lib/narratorVoice.test.ts src/lib/speech.test.ts src/pages/HostLobby.test.tsx src/game/HostGame.test.tsx
```

`HostGame.test.tsx` is included as a regression check on narration and `reading_done`; it shouldn't need changes.

**Manual checks (human, on the host iPhone; report results in the PR):**
1. **Detection:** with a Premium voice downloaded, the button shows it on first open with nothing saved, and the picker labels Premium/Enhanced correctly. Note the real `name`/`voiceURI` format iOS Safari reports (answers product's open question 1).
2. **Tip path:** the settings path in the tip matches the iOS version on the device (product's open question 2). Fix the constant if not.
3. **Timing:** play at least 20 clues of mixed length (include a long one near 14 s) with the automatically chosen voice and with each installed Premium/Enhanced English voice. The buzzer must never light before the reading ends. Report any voice that misses (see "Timing decision").
4. **Late list:** reload the lobby and open the picker immediately; then start a game right after reload. The first clue reads without delay.

## Database migration plan

None.

## Logging requirements

None. The web client ships no telemetry yet (Grafana Faro is not implemented), and no server log changes. Don't add `console.log` of voice lists to production code.

## Docs to update

- `docs/product-docs/features/gameplay/feature-brief.md`: remove **Not yet implemented** from "The narrator's voice" and the line "Today the narrator uses the browser's default voice."
- `docs/product-docs/features/gameplay/interaction-design.md`: remove the markers on the two voice edge cases.
- `docs/product-docs/features/lobby/feature-brief.md`: remove the marker on **Voice**.
- `docs/product-docs/features/lobby/interaction-design.md`: remove the markers on the 🔊 button, "Narrator voice picker", and the five voice edge cases; correct the tip text and the labels if they changed.
- `docs/system-docs/engineering/stack.md`: `web/` row: "Voice input (Web Speech API)" → "Voice input and narration (Web Speech API)".
