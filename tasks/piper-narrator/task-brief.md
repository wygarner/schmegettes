---
jira-type: enhancement
jira-title: "Schmegettes voices: free Piper narrators the host picks, generated on the host device"
---
# Task spec: piper-narrator

Product brief: `tasks/piper-narrator/product-brief.md`. Rules: `docs/product-docs/features/gameplay/feature-brief.md#the-narrators-voice` and the gameplay edge cases; lobby picker: `docs/product-docs/features/lobby/interaction-design.md#narrator-voice-picker-host-device`.

**Scope:** `web/` (narration, lobby picker), `devtools/` (an on-device spike), and, only if the spike's measurements require it, two constants in `game/`. No `shared/` contract, database, or `api/` change. The voice choice stays on the device.

## Approach

- **Engine:** Piper `.onnx` voices run with `onnxruntime-web` in a **Web Worker** on the host device only. The main thread only schedules audio, so the host's buzzer never waits on synthesis.
- **Package: `piper-plus` (MIT), pending the spike.** It's the only browser Piper package that says it ships no espeak-ng ("espeak-ng dependency | None (GPL-free)"). The alternatives (`@mintplex-labs/piper-tts-web`, `@diffusionstudio/vits-web`) bundle a phonemizer WASM that is very likely espeak-ng (GPL-3.0). **No GPL code or data may be served by `web/`.** Changing that is a human licensing decision, not part of this task.
- **The risk the spike settles:** our three voices were trained on espeak-ng phonemes. `piper-plus` uses its own rule-based English G2P (`@piper-plus/g2p`, "SimpleEnglishPhonemizer"), so pronunciation may drift. Numbers ("1,600") may not be expanded.
- **Voice files:** downloaded from Hugging Face (`rhasspy/piper-voices`), pinned to a commit, and checked against a SHA-256 recorded in the code. Hugging Face serves them free with CORS. Our own hosts can't: Supabase's free uploads cap at 50 MB and Cloudflare Pages caps files at 25 MB. Stored in Cache Storage, one voice at a time.
- **Narration flow:** `HostGame` calls one `narrate(text)` instead of `speak()`. `narrate` picks Piper or the built-in voice per line and applies the 1.5 s / 2-in-a-row fallback rules. It splits the text into sentences so the short announcement plays while the clue is still being synthesized.

## Subtasks

### 0. Spike on the host iPhone: `devtools/src/designs/system/piper-voice.tsx` (new). **Gate: stop and report before subtask 1.**

An internal-only prototype (devtools is never deployed). Add `piper-plus`, `onnxruntime-web` and, for comparison only, `@mintplex-labs/piper-tts-web` to **`devtools/package.json`** (exact versions). Run it on the iPhone over the LAN (`mise run dev:devtools -- --host`).

The page loads one of the three voices from its pinned Hugging Face URL. Use 20 real clues of mixed length from the clue catalog: copy them in as a fixture, at least one near 14 s of speech and several with numbers, years, money, "&", and proper nouns. For each, it shows and records:

1. **Pronunciation A/B:** Kristin read by `piper-plus` vs the espeak-based package, played back to back.
2. **Speed:** time to load the model from Cache Storage, time to the first audio of "Here's Volcanoes for 400.", and the real-time factor (synthesis time / audio length) for each clue, on WASM and on WebGPU if `piper-plus` uses it on iOS.
3. **Stamina:** a "run 60 clues" button that synthesizes and plays a full game's worth back to back. Record whether Safari reloads the tab and any memory figure the Safari Web Inspector shows.
4. **Main thread:** while it synthesizes, a big test button logs tap-to-handler delay. It must stay under 50 ms (Safari has no Long Tasks API, so measure the handler delay itself).
5. **CORS:** the Hugging Face fetch works from the page, and which hosts it redirects to (needed for a future CSP).

**Report to the human (PR comment or message) with the numbers, then stop if any of these holds:**
- `piper-plus` English is noticeably worse than the espeak-based reading on more than a couple of the 20 clues. Options then: allow espeak-ng (GPL) in `web/`, try `piper-plus` with a CMUdict-based lexicon, or drop Piper. Product and licensing decision.
- The real-time factor on the iPhone is above **0.5** for typical clues. Above that, a clue can't start within 1 s and keep ahead of playback.
- The 60-clue run reloads the tab.

Otherwise continue. Leave the prototype in `devtools/` for later tuning.

### 1. Voice catalog and download manager: `web/src/lib/piper/voices.ts` (new)

- `PIPER_VOICES`: one readonly list, `{ id: "kristin" | "norman" | "john", name, modelUrl, configUrl, sha256, bytes }`, for `en_US-kristin-medium`, `en_US-norman-medium`, `en_US-john-medium`. URLs use `https://huggingface.co/rhasspy/piper-voices/resolve/{commit}/en/en_US/{voice}/medium/{file}`, with the commit pinned. Take `sha256` and `bytes` from the Hugging Face file pages (LFS pointer). Comment: public domain per each model card; never add an NC, lessac-licensed, or lessac/Ryan-derived voice (product brief).
- `DEFAULT_PIPER_VOICE = "kristin"`.
- `voiceStatus(id)`: `absent | downloading (fraction) | ready | failed | unavailable` as a small subscribable store (`useSyncExternalStore`-friendly).
- `ensureVoice(id)`:
  - Returns the cached voice from Cache Storage (`caches.open("schmegettes-voices-v1")`) when present.
  - Otherwise it fetches with progress, verifies the SHA-256 (`crypto.subtle.digest`, inside the worker so the main thread never hashes 63 MB), and stores the result.
  - One download at a time: a new `ensureVoice` aborts the previous one (`AbortController`).
  - After a voice becomes ready, it deletes the other voices' entries (one kept).
  - It calls `navigator.storage.persist?.()` once, best effort.
- Failure (network, hash mismatch, quota) → `failed`; `retry(id)` restarts it.
- Code-split: everything under `web/src/lib/piper/` loads only through a dynamic `import()` from the host screens, so phones never download the engine or a voice.

### 2. Synthesis worker: `web/src/lib/piper/worker.ts`, `web/src/lib/piper/engine.ts` (new)

- `engine.ts` (main thread) wraps the worker (`new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`) behind an interface the tests fake:

  ```ts
  interface PiperEngine {
    load(voiceId): Promise<void>;
    synthesize(sentence, signal): Promise<Float32Array>;
    sampleRate: number;
    dispose(): void;
  }
  ```

- The worker owns the ONNX session for one voice at a time. Switching voices disposes the old session first, to keep memory down. Audio comes back as a transferable `Float32Array`.
- **Device check:** after `load`, synthesize "Here's Volcanoes for 400." silently, which also warms the model. If the real-time factor is above 0.5 (the spike threshold), mark Piper `unavailable` on this device for this visit.
- Serve onnxruntime-web's `.wasm` from our own build (`ort.env.wasm.wasmPaths` → Vite asset URLs). Check that each file is under 25 MB, to stay deployable on any static host. If one isn't, load it from jsDelivr at the pinned version and note it under "Docs to update".
- Text normalization before G2P: `web/src/lib/piper/normalize.ts` (new). It reuses `spokenText` ("&" → "and") and adds whatever the spike shows `piper-plus` lacks: at least numbers with commas ("1,600" → "sixteen hundred" or "one thousand six hundred", one rule, documented), years (1984), plain integers, "$" amounts, "%", and ordinals ("21st"). Keep it a pure function.

### 3. Narrator: `web/src/lib/narrator.ts` (new); `web/src/lib/speech.ts`, `web/src/lib/narratorVoice.ts` (changed)

- **Saved choice** (`narratorVoice.ts`): the stored value is now `piper:{id}` or a built-in `voiceURI`; nothing saved means `piper:kristin`. Add `narratorChoice(): { kind: "piper"; id } | { kind: "device"; uri: string | null }`. Hosts who saved a built-in voice in #119 keep it, because their stored value is a URI.
- **`narrate(text): Promise<SpeakResult>`**, the single entry point for every narrated line:
  - The choice is Piper, the voice is `ready`, and this game isn't degraded → Piper:
    - Split the text into sentences; the announcement is the first sentence.
    - Synthesize sentence 1, start playback, and synthesize the next sentence while the current one plays, scheduling them back to back on one `AudioContext`.
    - Resolve `"ended"` when the last buffer ends.
  - **Fallback:**
    - If the first audio hasn't started **1.5 s** after `narrate` was called, or the engine errors, cancel the Piper line and read the whole line with the built-in `speak(text)`. Count a miss.
    - A Piper line that plays resets the count.
    - **2 misses in a row** → `degraded` for the rest of the game.
  - Otherwise use the built-in `speak(text)` (best device voice, as today).
  - The voice becomes ready mid-game → the next `narrate` call uses it (never mid-line).
- `resetNarrationForGame()` clears `degraded` and the miss count. Call it when a game starts (phase leaves `lobby`) and on rematch.
- `stopNarration()` stops Piper playback and the built-in speech. It replaces `stopSpeaking()` at its call sites.
- **iOS unlock:** `unlockSpeech()` also creates or resumes the shared `AudioContext` from the same first tap.
- If Piper playback can't start because audio is blocked, `narrate` returns `"failed"` like `speak()`, so `HostGame`'s existing "tap to turn on sound" path works unchanged.
- `HostGame.tsx`: `say` calls `narrate(speech.text)` instead of `speak(spokenText(speech.text))` (normalization moves into the narrator). "Sound on" goes through `narrate` too. `reading_done` is still sent only on `"ended"`.
- Host screens (`HostLobby`, `HostGame`) call `ensureVoice(choice.id)` on mount when the choice is Piper. That lazy-imports the piper module, so a reload mid-game loads from Cache Storage.

### 4. Lobby picker: `web/src/game/NarratorVoicePicker.tsx`, `web/src/pages/HostLobby.tsx`

- A **"Schmegettes voices"** group comes first: Kristin, Norman, John, each with its state on the right ("Downloading… 40%", nothing when ready or not downloaded, "Couldn't download" + **Try again**, "Not available on this device"). Then the existing "Voices on this device" group.
- Tapping a Schmegettes voice saves `piper:{id}` and calls `ensureVoice(id)`. Once that voice is ready, play the sample through `narrate`'s Piper path. If another voice was tapped in the meantime, skip the sample.
- The button reads `🔊 {name}`, or `🔊 {name} · 40%` while downloading.
- **Tip rule:** show it only when Piper is `unavailable` or `failed` **and** no Premium/Enhanced voice is installed (and `tipPlatform()` isn't null).
- Start calls `stopNarration()`.

### 5. Conditional: server reading margin, `game/internal/play/game.go`

**Only if** manual check 3 shows a reading (pick → audio end) that runs past the server's estimate. In `ReadingTime`, raise the margin from `time.Second` to `2 * time.Second`, and raise `MaxReading` from 14 s to 15 s. This is approved in the product brief (2026-11-17). Update the `ReadingTime` comment and the tests in `game/internal/play/`. If not needed, say so in the PR and leave `game/` untouched.

### 6. Docs

See "Docs to update".

## Key files

| Subtask | Files |
|---|---|
| 0 | `devtools/src/designs/system/piper-voice.tsx` (new), `devtools/package.json`, `bun.lock` |
| 1 | `web/src/lib/piper/voices.ts` (new) + test |
| 2 | `web/src/lib/piper/worker.ts`, `engine.ts`, `normalize.ts` (new) + tests; `web/package.json` (`piper-plus`, `onnxruntime-web`, exact versions), `bun.lock`; `web/vite.config.ts` only if worker or wasm asset config needs it |
| 3 | `web/src/lib/narrator.ts` (new) + test; `web/src/lib/narratorVoice.ts`, `web/src/lib/speech.ts`, `web/src/game/HostGame.tsx` |
| 4 | `web/src/game/NarratorVoicePicker.tsx`, `web/src/pages/HostLobby.tsx` + tests |
| 5 (conditional) | `game/internal/play/game.go`, `game/internal/play/game_test.go` |

## Contracts preserved

- `shared/`: unchanged. The voice choice and audio never reach the server.
- WebSocket: unchanged. `reading_done` is still sent only when narration really ended.
- `game/`: unchanged unless subtask 5 is triggered. That changes timing constants only, not messages or phases.
- Phones: unchanged. They never import `web/src/lib/piper/` (check the build: the piper chunk must not be in the phone routes' initial graph).

## Success criteria

1. Spike report delivered (subtask 0), with the gate passed or a human decision recorded.
2. On a fresh host iPhone, Kristin downloads in the lobby (about 63 MB, verified by SHA-256). Later visits load it from Cache Storage with no download.
3. Each of Kristin, Norman and John can be picked: it downloads, plays its sample, and narrates a game. After a switch, only the new voice is in Cache Storage.
4. Switching never leaves the narrator silent: the previous voice (or the built-in one) reads until the new one is ready.
5. For each clue, the first word plays within 1 s of the clue appearing. Buzzing never opens before the reading ends (with subtask 5 if needed).
6. Fallback rules hold:
   - A line not started 1.5 s after it should have uses the built-in voice.
   - 2 misses in a row put the rest of the game on the built-in voice.
   - A voice that becomes ready mid-game takes over at the next line.
7. No network, or blocked storage → the built-in voice narrates the whole game, and Start works.
8. With the host playing, tap-to-buzz handler delay stays under 50 ms while lines are synthesized.
9. Phones load no Piper code or voice. No paid service, key, or server is involved. No GPL code or data is in the `web/` build.

## Test plan

Unit and component tests (Vitest + Testing Library). The ONNX engine and worker are faked behind `PiperEngine`; jsdom can't run ORT.

- **`web/src/lib/piper/voices.test.ts`:**
  - Downloads report progress.
  - A SHA-256 mismatch → `failed`, and nothing is cached.
  - `retry` works.
  - A second `ensureVoice` aborts the first.
  - Ready → the other voices' cache entries are deleted.
  - A cached voice → no fetch.
  - Fake `fetch`, `caches`, and `crypto.subtle`.
- **`web/src/lib/piper/normalize.test.ts`:** "1,600", "1984", "$400", "50%", "21st", "Lewis & Clark", and text with no numbers unchanged.
- **`web/src/lib/narrator.test.ts`** (fake timers, fake engine, fake `AudioContext`):
  - Piper path plays sentences in order and resolves `"ended"` after the last.
  - The first audio later than 1.5 s → built-in `speak` with the full text, and a miss is counted.
  - An engine error → built-in.
  - 2 misses in a row → degraded, and later lines skip Piper even when it's ready.
  - A successful Piper line resets the count.
  - `resetNarrationForGame` clears degraded.
  - Voice not ready → built-in. Ready on a later call → Piper.
  - Device choice → built-in only.
  - Blocked audio → `"failed"`.
- **`web/src/lib/narratorVoice.test.ts`** (extend): `narratorChoice` for nothing saved (Kristin), `piper:norman`, a saved built-in URI, and an unknown `piper:x` (→ Kristin).
- **`web/src/pages/HostLobby.test.tsx`** (extend):
  - Schmegettes group first, with states.
  - Tapping Norman saves `piper:norman` and starts its download.
  - Button shows "· 40%".
  - **Try again** retries.
  - The sample plays when ready and is skipped if another voice was tapped meanwhile.
  - The tip shows only when Piper is unavailable and there's no natural voice.
  - Start stops narration.
- **`web/src/game/HostGame.test.tsx`** (extend): lines go through `narrate`; `reading_done` only on `"ended"`; the narration resets when a game starts.

```bash
mise run test:web -- src/lib/piper src/lib/narrator.test.ts src/lib/narratorVoice.test.ts src/lib/speech.test.ts src/pages/HostLobby.test.tsx src/game/HostGame.test.tsx
mise run test:game -- ./internal/play/...    # only if subtask 5 is done
```

Also run `tsc -b` and `biome check` on touched files, and a web production build (`bun run --cwd web build`). From the build, confirm that the piper chunk is lazy, that each `.wasm` is under 25 MB, and that no espeak files are in `web/dist` (`grep -ril espeak web/dist` is empty).

**Manual checks (human, host iPhone in Safari, mirrored to the TV; report in the PR):**
1. Fresh device: Kristin downloads in the lobby and the button shows progress. A reload loads it with no download (Web Inspector → Storage).
2. Pick Norman, then John: each downloads, plays its sample, and the old one is gone from Cache Storage.
3. **Timing:** 20 clues including a long one: the first word within 1 s, and the buzzer never lights before the reading ends. If it does, apply subtask 5 and repeat.
4. A full game with the host playing: no tab reload, no silence, and the host's buzzer feels instant.
5. Airplane mode in the lobby (download fails) → "Couldn't download", the built-in voice narrates, and **Try again** works once back online.

## Database migration plan

None.

## Logging requirements

None. The web client has no telemetry yet (Grafana Faro is not implemented), and the server is unchanged. No `console.log` in production code. Clue text must not be logged anywhere.

## Docs to update

- `docs/product-docs/features/gameplay/feature-brief.md`, `gameplay/interaction-design.md`, `lobby/feature-brief.md`, `lobby/interaction-design.md`: remove the **Not yet implemented** markers this task fulfills, and correct any detail that changed (state labels, thresholds).
- If subtask 5 is done: the reading rule in `gameplay/feature-brief.md` ("2.5 words per second plus 1 s, at most 14 s" → "plus 2 s, at most 15 s") and the Reading row in `gameplay/interaction-design.md`'s Timing table.
- `docs/system-docs/engineering/stack.md`:
  - `web/` component row: "Voice input and narration (Web Speech API; Piper voices via onnxruntime-web in a Web Worker)".
  - Add a decision row or note: Piper narration runs on the host device; voices come from Hugging Face, pinned by commit and SHA-256; no GPL code is served.
- `docs/system-docs/security/security-model.md`, Web security headers row: when the CSP is written, it must allow `connect-src` to `huggingface.co` and the hosts the spike found it redirects to, `worker-src 'self'`, and `script-src 'wasm-unsafe-eval'` for onnxruntime-web.
- `docs/system-docs/operations/deployment.md`, web row: note the 25 MB-per-file constraint for the `.wasm` assets, and where they're served from.

## Branch
`enhancement/piper-narrator-impl`, from and into `daily/2026-11-17`. No Jira ticket: Jira setup is not done for this repo (development-workflow.md, "Jira setup"), so the folder stays `tasks/piper-narrator/` and PR titles use `piper-narrator` in place of `SCH-{N}`.
