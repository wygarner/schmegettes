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

**Most likely cause (unverified):** the device speed check, not a crash. `web/src/lib/piper/engine.ts` times a warm-up line after loading a voice and, if synthesis takes more than `MAX_REALTIME_FACTOR = 0.5` of the audio's length, calls `markDeviceUnavailable()`: every Schmegettes voice becomes "Not available on this device" and the built-in voice reads, with no other sign. The worker runs onnxruntime on **one thread** (`numThreads = 1`), and production sends no `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`, so multi-threaded WebAssembly isn't possible anyway. An iPhone 11 (A13) on one thread plausibly misses 0.5. First step: measure the real-time factor on an iPhone 11 in production and say whether the picker showed "Not available on this device".

**Other places to look if it isn't the speed check:** the speech worker (module worker, `worker-src` falls back to `script-src 'self'`), how onnxruntime-web finds its `.mjs`/`.wasm` in the production build (only `wasm` is set in `wasmPaths`), the espeak-ng/piper-phonemize data file, the browser's storage quota for 63 MB, and any difference between the staging and production builds or headers.

**Player flow (expected, unchanged):**
- The host lobby opens; Kristin downloads in the background, with progress on the 🔊 button.
- Tapping a Schmegettes voice in the picker plays the sample in that voice once it's ready.
- In a game, every line (clues, Daily Double and Final lines, correct response) is read in that voice.

**Success Criteria:**
- **An iPhone 11 can host with a Schmegettes voice.** It's the oldest host device we target; `schmegettes-voices-only` makes a device that fails the check unable to host.
- On production, on an iPhone 11 (Safari, current iOS), a recent iPhone, and desktop Chrome: Kristin downloads in the lobby, its sample plays, and a full clue is read in Kristin in a game.
- The root cause is named in the PR and covered by a test where one is possible, or by a check in the staging smoke tests if it's a build/header problem.
- If it's the speed limit, the fix makes the iPhone 11 pass honestly: the clue still starts within 1 s of appearing and playback never stalls mid-line. The 1.5 s pick reveal in `clue-pacing` gives the narrator that long to prepare the clue, which may allow a looser limit. Multi-threading (cross-origin isolation) or a lighter model are engineering's call. A different voice or quality level is a product change: bring it back to `/product`.
- The PR reports the measured real-time factor before and after, on the iPhone 11.

**Out of scope:** removing the device voices (`schmegettes-voices-only`), any change to the voices or their download.
