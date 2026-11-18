---
jira-type: bug-fix
jira-title: "Schmegettes narrator voices don't play in production"
---
**Task Type:** Bug Fix. The Schmegettes voices (Piper, shipped in `piper-narrator`) are specified and built, but in production QA (2026-11-18) the narrator never used them.

**Product docs:** unchanged by this fix. Behavior is `docs/product-docs/features/gameplay/feature-brief.md#the-narrators-voice` and the lobby voice picker in `features/lobby/interaction-design.md`.

**Problem:** On production (`schmegettes-web-prod.vercel.app`), the narrator doesn't speak in a Schmegettes voice (Kristin, Norman, John). Whatever the room heard was the device's built-in voice, or nothing.

**What's already ruled out (checked 2026-11-18 from outside the browser):**
- The voice files are reachable: the pinned Hugging Face URL (`rhasspy/piper-voices` at `0ca208af…`) redirects to `us.aws.cdn.hf.co` and serves the 63,531,379-byte model with `access-control-allow-origin: *`.
- Production's Content-Security-Policy `connect-src` allows `https://huggingface.co` and `https://*.hf.co`, and `script-src` has `'wasm-unsafe-eval'`.

**Where to look first (unverified):** the speech worker (module worker, `worker-src` falls back to `script-src 'self'`), how onnxruntime-web finds its `.mjs`/`.wasm` in the production build (only `wasm` is set in `wasmPaths`), the espeak-ng/piper-phonemize data file, the browser's storage quota for 63 MB, and any difference between the staging and production builds or headers.

**Player flow (expected, unchanged):**
- The host lobby opens; Kristin downloads in the background, with progress on the 🔊 button.
- Tapping a Schmegettes voice in the picker plays the sample in that voice once it's ready.
- In a game, every line (clues, Daily Double and Final lines, correct response) is read in that voice.

**Success Criteria:**
- On production, on an iPhone (Safari, current iOS) and on desktop Chrome: Kristin downloads in the lobby, its sample plays, and a full clue is read in Kristin in a game.
- The root cause is named in the PR and covered by a test where one is possible, or by a check in the staging smoke tests if it's a build/header problem.
- If the cause is a device limit (for example, the iPhone can't run the model fast enough), the PR says so with measurements, and the product question goes back to `/product` before `schmegettes-voices-only` ships.

**Out of scope:** removing the device voices (`schmegettes-voices-only`), any change to the voices or their download.
