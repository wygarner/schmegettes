---
jira-type: enhancement
jira-title: "Narrator uses only the Schmegettes voices; Start waits for the voice"
---
# Task spec: schmegettes-voices-only

Product brief: `tasks/schmegettes-voices-only/product-brief.md`. Rules: `docs/product-docs/features/gameplay/feature-brief.md#the-narrators-voice`, lobby `feature-brief.md` (Voice, Start) and `interaction-design.md` (voice picker, edge cases).

**Depends on:** `schmegettes-voices-prod` merged first (otherwise iPhones on silent hear nothing at all).

## Approach

Remove the device-voice path from the narrator, and gate Start on the picked Piper voice being `ready`. The server is unchanged: Start gating is client-side on the host device, which is the only device that can press Start, and the reading fallback timer already covers a skipped line.

- `narrate()` never calls `speak()`. A Piper line that misses its start (1.5 s) or errors returns a new result `"skipped"`, which the caller treats like a line that didn't end: no `reading_done`, so the server opens buzzing on its fallback. `"failed"` (audio blocked) stays as is, and still shows "Tap to turn on sound".
- Drop the miss counter and `degraded` (no fallback to degrade to). Every line tries Piper again.
- `narratorChoice()` always returns a Piper voice; a saved `device:` value maps to Kristin.
- `unlockSpeech()` keeps only `unlockAudio()`; the silent `SpeechSynthesisUtterance` goes.

## Subtasks

1. **web: narrator** (`web/src/lib/narrator.ts`): remove the `speak` fallback, `MAX_MISSES`, `degraded`, `resetNarrationForGame` (and its call in `HostGame.tsx`); add `"skipped"` to `NarrateResult`. `stopNarration()` stops Piper only.
2. **web: voice choice** (`web/src/lib/narratorVoice.ts`): `narratorChoice()` → `{ kind: "piper", id }` only; delete the device-voice ranking, novelty list, quality labels, `tipPlatform`, `useNarratorVoices`, `currentVoices` and their tests, keeping only what the Piper choice needs. Saved device URIs fall back to Kristin without a message.
3. **web: speech** (`web/src/lib/speech.ts`): delete `speak`, `stopSpeaking`, `SPEECH_START_TIMEOUT_MS`, the speech-synthesis half of `unlockSpeech`, and `announcement` only if `clue-pacing` has already removed it (otherwise leave it). Recognition code is untouched.
4. **web: picker** (`web/src/game/NarratorVoicePicker.tsx`): only Kristin, Norman, John; no "Voices on this device" section, no settings tip. The sample line is "Here's a sample of my voice." and plays once the voice is ready.
5. **web: lobby Start gate** (`web/src/pages/HostLobby.tsx`): Start is enabled only when the contestant rule holds **and** `voiceStatus(picked).state === "ready"`. Labels: "Getting {Name} ready… {n}%" while downloading or loading; "Couldn't download the voice" with **Try again** on failure. When `voiceStatus` is `unavailable` (device too slow), hide 🔊 and show the notice "This device can't run the Schmegettes narrator. Host from a recent iPhone, iPad or computer." in place of the join-URL line, with Start disabled.
6. **web: host game** (`web/src/game/HostGame.tsx`): handle `"skipped"` (no report, no sound-blocked banner). The reload-mid-game path keeps `prepareVoice()`; lines before it's ready return `"skipped"`.
7. **Docs**: below.

## Key files

`web/src/lib/narrator.ts`, `narratorVoice.ts`, `speech.ts`, `web/src/game/NarratorVoicePicker.tsx`, `HostGame.tsx`, `HostLayout.tsx` (unlock listener), `web/src/pages/HostLobby.tsx`, and their tests.

## Contracts preserved

No change to `shared/`, REST, WebSocket, or the database. The server's reading fallback (`play.ReadingTime`) already covers a skipped line.

## Success criteria

- No code path in `web/src` calls `speechSynthesis` (grep in review).
- Start is disabled while the picked voice downloads or loads, after a failed download, and when the device is unavailable; it enables the moment the voice is `ready` (with 2 contestants).
- A forced Piper failure of one line skips it (no `reading_done` sent) and the next line is spoken in the Schmegettes voice.
- A device whose saved choice is a `device:` URI shows Kristin in the picker and narrates in Kristin.

## Test plan

- `web/src/lib/narrator.test.ts`: engine not ready → `"skipped"`, `speak` never called; first chunk misses 1.5 s → `"skipped"`; synthesis throws mid-line → `"skipped"`; consecutive failures don't change later behavior.
- `web/src/lib/narratorVoice.test.ts`: saved `device:` value → Kristin; Piper values round-trip.
- `web/src/pages/HostLobby.test.tsx`: Start disabled with label while `downloading`/`loading`; Try again on `failed`; notice and no 🔊 on `unavailable`; enabled on `ready` with 2 contestants.
- `web/src/game/HostGame.test.tsx`: a `"skipped"` reading sends no `reading_done` and shows no sound-blocked button.
- `mise run test:web -- src/lib/narrator.test.ts src/lib/narratorVoice.test.ts src/pages/HostLobby.test.tsx src/game/HostGame.test.tsx`

## Database migration plan

None.

## Logging requirements

None (client only).

## Docs to update

- `docs/system-docs/engineering/stack.md`: Narration row and the `web/` component row: remove "the device's built-in voices (Web Speech API) are the fallback"; Web Speech API stays for recognition only.
- Any system doc that describes the fallback (`grep -rn "built-in voice" docs/system-docs`).

## Branch

`enhancement/schmegettes-voices-only-impl`, from and into `develop`. Jira isn't set up yet (`.github/jira.json` issue types are `REPLACE_ME`), so there's no `SCH-{N}`: the folder keeps its name, and the PR title is `[Enhancement] schmegettes-voices-only: …`.
