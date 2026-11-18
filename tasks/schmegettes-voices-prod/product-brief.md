---
jira-type: bug-fix
jira-title: "Schmegettes narrator voices don't play in production"
---
**Task Type:** Bug Fix. The Schmegettes voices (Piper, shipped in `piper-narrator`) are specified and built, but in production QA (2026-11-18, **iPhone 11**, Safari) the narrator never used them.

**Product docs:** unchanged by this fix. Behavior is `docs/product-docs/features/gameplay/feature-brief.md#the-narrators-voice` and the lobby voice picker in `features/lobby/interaction-design.md`.

**Problem:** On production (`schmegettes-web-prod.vercel.app`), the narrator doesn't speak in a Schmegettes voice (Kristin, Norman, John). Whatever the room heard was the device's built-in voice, or nothing.

**What's already ruled out (checked 2026-11-18 from outside the browser):**
- The voice files are reachable: the pinned Hugging Face URL (`rhasspy/piper-voices` at `0ca208af…`) redirects to `us.aws.cdn.hf.co` and serves the 63,531,379-byte model with `access-control-allow-origin: *`.
- Production's Content-Security-Policy `connect-src` allows `https://huggingface.co` and `https://*.hf.co`, and `script-src` has `'wasm-unsafe-eval'`.

**Repro (QA, iPhone 11, Safari, production):**
1. A game was narrated without the Schmegettes voice.
2. Mid-game, "Tap to turn on sound" appeared. Tapped it.
3. Back in the lobby, the Norman sample **played**.
4. Closed the tab, reopened the lobby: the voice sample **didn't play**.

So the device can generate the voice (step 3); what fails is getting its audio out, and only sometimes. The narrator noticed only mid-game, not before the first clue.

**Leads, in order (unverified):**
- **Web Audio stays locked or gets interrupted on iOS.** The voices play through one `AudioContext` (`web/src/lib/piper/audio.ts`), unlocked by `resume()` on a document click (`HostLayout.tsx`). On iOS a `resume()` alone isn't always enough (playing a silent buffer inside the tap is the usual fix), and the context goes `interrupted` when something else takes the audio session: the microphone (a host who plays), built-in speech, or the tab going to the background. Nothing re-unlocks it until the next tap, and "sound blocked" is only noticed later.
- **The ring/silent switch.** On iOS, Web Audio follows the silent switch by default, but built-in speech doesn't. A phone on silent hears built-in voices but not the Schmegettes voice (`navigator.audioSession.type = "playback"` exists for this).
- **The speed check on a cold start.** After reopening, the voice loads from storage and the first warm-up line runs on a cold engine. If it's slower than `MAX_REALTIME_FACTOR = 0.5`, `markDeviceUnavailable()` turns every Schmegettes voice off for the visit. The worker runs on one thread (`numThreads = 1`; production isn't cross-origin isolated).

**Other places to look:** the speech worker (module worker, `worker-src` falls back to `script-src 'self'`), how onnxruntime-web finds its `.mjs`/`.wasm` in the production build (only `wasm` is set in `wasmPaths`), the espeak-ng/piper-phonemize data file, the browser's storage quota for 63 MB, and any difference between the staging and production builds or headers.

**Player flow (expected, unchanged):**
- The host lobby opens; Kristin downloads in the background, with progress on the 🔊 button.
- Tapping a Schmegettes voice in the picker plays the sample in that voice once it's ready.
- In a game, every line (clues, Daily Double and Final lines, correct response) is read in that voice.

**Success Criteria:**
- The repro above passes: on an iPhone 11, the sample plays after a fresh tab, and every line of a game is heard in the Schmegettes voice, including after the host's microphone was used and after the phone was locked and unlocked.
- If sound is blocked, the host sees "Tap to turn on sound" before the first line is due, never mid-game after lines were already lost.
- **An iPhone 11 can host with a Schmegettes voice.** It's the oldest host device we target; `schmegettes-voices-only` makes a device that fails the check unable to host.
- On production, on an iPhone 11 (Safari, current iOS), a recent iPhone, and desktop Chrome: Kristin downloads in the lobby, its sample plays, and a full clue is read in Kristin in a game.
- The root cause is named in the PR and covered by a test where one is possible, or by a check in the staging smoke tests if it's a build/header problem.
- If it's the speed limit, the fix makes the iPhone 11 pass honestly: the clue still starts within 1 s of appearing and playback never stalls mid-line. The 1.5 s pick reveal in `clue-pacing` gives the narrator that long to prepare the clue, which may allow a looser limit. Multi-threading (cross-origin isolation) or a lighter model are engineering's call. A different voice or quality level is a product change: bring it back to `/product`.
- The PR reports the measured real-time factor before and after, on the iPhone 11.

**Out of scope:** removing the device voices (`schmegettes-voices-only`), any change to the voices or their download.
