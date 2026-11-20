---
task-type: improvement
task-title: "End-to-end tests, a boot check in CI, and enforced coverage"
---
# Task spec: release-test-layer

Product brief: `tasks/release-test-layer/product-brief.md`. Four independent parts, which can be separate commits in one PR: (A) the Playwright suite, (B) the CI boot check, (C) coverage floors, (D) exact runtime pins.

## Decisions (Wyatt Garner, 2026-11-20)

1. **The E2E host is a dedicated, signed-in staging account with permanent host access.** The suite never reads a host code and holds no admin credentials. Host-code redemption stays covered by its existing pgTAP and api tests. This replaces step 1 of the product brief's flow ("the host enters a host code") for the suite only.
2. **Accounts:** the two phones are fresh guests on every run. The host signs in with `E2E_HOST_EMAIL` (non-secret variable) and `E2E_HOST_PASSWORD` (secret), both in the GitHub `staging` environment, never in the repo.

**No new code creates the account.** Host access never expires and rotation never removes it ([private access](../../docs/product-docs/features/private-access/feature-brief.md#host-codes)), so the operator does this once, by hand, on staging:

1. In a private window on the staging web app, **Create account** with the E2E email and a generated password.
2. Read the current code on the devtools admin page (staging), and enter it on that account's host code sheet.
3. Optionally, set the host's note on the admin page to "E2E host (do not remove)".
4. Store the two values in the GitHub `staging` environment.

The implementation PR writes these steps into `testing-strategy.md` (under the end-to-end layer). Until they're done, the E2E workflow exits with a clear "E2E_HOST_EMAIL / E2E_HOST_PASSWORD not set on staging" error. The boot check, coverage floors, and pins don't depend on it. The `agent-qa` task can reuse the same steps for its QA host.

## Approach

**(A) Playwright suite** in `e2e/`, a new workspace package, run against a deployed environment by base URL. It uses three browser contexts in one test:
- the host at 844 × 390, with touch;
- two phones at 390 × 844, with touch;
- all with `permissions: ["microphone"]` and a fake media stream (`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`).

Narration and speech recognition can't be driven in headless Chromium, so the suite uses an **E2E mode** that exists only outside production:
- It's on when `import.meta.env.VITE_ENV !== "production"` **and** the page URL has `?e2e=1`, saved in `sessionStorage` for the tab. The production build tree-shakes it out: guard with a build-time constant, and assert in a unit test that the production bundle has no `__e2e`.
- `narrate()` resolves `"ended"` at once, with no download. The voice reports ready, so Start isn't blocked.
- `recognitionSupported()` is true, and `setRecognizerFactory` installs a scripted recognizer. The test drives it from `window.__e2e.say(text)`, which delivers `onFinal(text)` to the active recognizer. Answers and spoken picks go through the real `submit_answer`/pick path, just with typed text.
- The host device reports `reading_done` as soon as the clue screen shows (because narration "ends").

The game runs with **Double Schmegettes off**, so one board of 20 clues plus Final, finishing in a few minutes.

**(B) Boot check:**
- a CI job builds the api and game images (the same Dockerfiles as deploy) and runs them against the local Supabase that the `database` job already starts, with test config;
- it polls `/healthz` until 200 within 30 s;
- for web, it serves `vite build` output with `vite preview` and loads Home in Playwright, failing on any `console.error` or page error.

**(C) Coverage floors** are enforced per package:
- vitest `coverage.thresholds` per directory glob in `web/vitest.config.ts`;
- a small Go script, `scripts/coverage-floor.go` or `.cjs`, reads `coverage.out` per package path and compares against a floors file;
- `pytest --cov-fail-under` for the worker.

The floors come from `testing-strategy.md` §3. Any package below its floor today starts at its measured number (rounded down), with the target and a step-up date recorded in the doc.

**(D) Exact pins** in `mise.toml` for node, go and python (bun is already exact), plus a monthly runtime-bump routine documented in `stack.md`. Dependabot has no `mise` ecosystem, so it can't do this.

## Subtasks (narrow → wide)

1. **(D) runtime pins:**
   - `mise.toml`: `node = "24.x.y"`, `go = "1.25.x"`, `python = "3.13.x"`, using the latest patch at implementation time, with the date in a comment;
   - check that `go.mod` `toolchain` lines and the Dockerfile base images match (`golang:1.25.x`, `node:24.x.y`);
   - `stack.md` "Runtime pins": the routine (first Monday monthly: bump, `mise install`, push a PR).
2. **(B) boot check**, `.github/workflows/ci.yml`:
   - new job `boot` (needs `changes`, and runs when api, game, web or shared changed). It starts local Supabase as the `database` job does, builds `api/Dockerfile` and `game/Dockerfile`, and runs each with:
     - `DATABASE_URL` → the local `app_service` (the job sets its password, as `deployment.md` describes);
     - `SUPABASE_URL`/`SUPABASE_JWKS_URL` → local, and `ALLOWED_ORIGINS=http://localhost:4173`.
   - It polls `/healthz` for up to 30 s and fails with the container's last 50 log lines.
   - Web: `bun run --cwd web build && bunx vite preview --port 4173`, then a Playwright script loads `/` and fails on `console.error`/`pageerror`.
   - Add `boot` to `ci-complete`'s needs.
3. **(C) coverage floors:**
   - `web/vitest.config.ts`: `coverage.thresholds` keyed by glob (`src/lib/**`: 70; `src/pages/**`, `src/game/**`: 50), with lines and statements.
   - `devtools`: report only, with no floor (testing-strategy lists none).
   - Go: `scripts/coverage-floors.json` (`{"game/internal/play": 80, "game/internal/judge": 80, "golib/...": 80, "api/...": 70}`) and `scripts/coverage-floor.cjs`, which parses `go tool cover -func` output per package, prints a table, and exits 1 on any package below its floor. It runs in the `game` and `api` jobs, plus a `golib` step.
   - worker: `pytest --cov=schmegettes_worker --cov-fail-under=70` (or the measured start).
   - Measure today's numbers first. For any package below its floor, set the start floor to its current number and record "start N%, target M%, step-up by YYYY-MM-DD" in `testing-strategy.md`.
   - Unit test the floor script with a fixture `coverage.out`.
4. **(A) E2E mode in web:**
   - `web/src/lib/e2e.ts`: `e2eEnabled()` (non-production build and `?e2e=1` → `sessionStorage`) and `installE2E()`, which sets `window.__e2e = { say }`, installs the scripted recognizer through `setRecognizerFactory`, and flags the narrator and voices.
   - `narrator.ts`, `piper/voices.ts` and `NarratorVoicePicker.tsx`: when `e2eEnabled()`, narration resolves `"ended"` immediately and the voice status is `ready`. Nothing is downloaded.
   - `speech.ts`: `recognitionSupported()` returns true in E2E mode.
   - Call `installE2E()` in `main.tsx` before render.
   - Tests:
     - off by default, and off in a production build even with `?e2e=1` (vitest with `VITE_ENV=production`);
     - `say()` reaches the active recognizer;
     - a build check that `__e2e` isn't in `dist/` for production (a small script in the web job: `bun run build` with `VITE_ENV=production`, then `grep -L __e2e`).
5. **(A) E2E suite** (`e2e/`, new package):
   - `package.json` with `@playwright/test` pinned exact; `playwright.config.ts` with `baseURL` from `E2E_BASE_URL`, one project (Chromium), `retries: 0`, `trace: "retain-on-failure"`, `screenshot: "only-on-failure"`, timeout 10 min.
   - `tests/critical-path.spec.ts` implements the brief's 7 steps with the E2E host (Decisions) and two guest phones. It uses roles and accessible names, the same selectors the unit tests use.
     - Step 4 asserts the verdict and the score change on all three screens.
     - Step 5 has phone A answer wrong (`say("wrong")`), then phone B buzz and answer right.
     - Step 6 plays the rest of the board quickly. The player in control taps the next clue; one phone buzzes and answers or lets it time out. Then Final: both finalists submit a wager and a typed answer. The scoreboard shows on every device, and in My games on one phone.
     - Step 7: phone B reloads mid-game and is back with the same score.
   - `mise.toml` task `test:e2e` (`bun run --cwd e2e test`).
6. **(A) run it:**
   - new workflow `e2e.yml`: `workflow_dispatch` (inputs: `environment`, default `staging`) and `workflow_call`. It installs Chromium, runs against `https://staging.schmegettes.app?e2e=1`, and uploads the `playwright-report/` and traces as artifacts on failure.
   - It isn't run on PRs (`stack.md`: release verification only).
   - `release-strategy.md` step 3: "Run E2E (`gh workflow run e2e.yml`) against staging; a failure blocks the release like red CI." `/engineering`'s Phase E reads that doc.
7. **docs**:
   - `testing-strategy.md`: the E2E row now says built (how to run it, E2E mode and why), the boot check, coverage floors (enforced, with any step-ups), and the line "Not yet implemented" removed for each;
   - `release-strategy.md` step 3;
   - `stack.md` runtime pins;
   - `configuration-and-secrets.md`: `E2E_HOST_PASSWORD` (staging environment secret) and the host account's email, as a non-secret variable `E2E_HOST_EMAIL`.

## Key files

`mise.toml`, `.github/workflows/{ci,e2e}.yml`, `scripts/coverage-floor.cjs` + `scripts/coverage-floors.json` (+ test), `web/vitest.config.ts`, `web/src/lib/{e2e,narrator,speech}.ts`, `web/src/lib/piper/voices.ts`, `web/src/game/NarratorVoicePicker.tsx`, `web/src/main.tsx`, `e2e/**` (new), `worker/pyproject.toml` (cov), Dockerfiles (pins), and the docs above.

## Contracts preserved

No change to `shared/`, the database, the api or the game server. E2E mode is client-only and absent from production builds.

## Success criteria

The product brief's criteria:
- 3 green runs in a row against staging with no retries, in under 10 minutes;
- a deliberately broken buzz path fails at step 4 with a screenshot (show it on a throwaway branch deployed to staging, or with a local run against a dev stack, and note which in the PR);
- an api that exits at boot fails the `boot` job;
- deleting a tested file's tests fails its floor;
- no minor-only pins remain;
- no "Not yet implemented" left in `testing-strategy.md` for E2E, the boot check or coverage.

## Test plan

- `mise run test:web -- src/lib/e2e.test.ts src/lib/narrator.test.ts src/lib/speech.test.ts`
- `node --test scripts/coverage-floor.test.cjs` (or the repo's script test runner; check the `scripts` CI job)
- `mise run test:e2e` locally against `mise run dev` (with `E2E_BASE_URL=http://localhost:5173`) to develop the suite; then `gh workflow run e2e.yml` on staging three times.
- The boot job is proven by the PR's own CI run. Also push a temporary commit that makes the api `os.Exit(1)` at start, record the red run, and revert.

## Database migration plan

None. The E2E host account is created by hand, once (Decisions), not by a migration or script.

## Logging requirements

No change. E2E mode logs nothing extra, and Faro (if the observability task has landed) tags E2E sessions with `e2e=true`, so they can be filtered out of client-error alerts.

## Docs to update

As in subtask 7.

## Branch

`technical-improvement/GH-243-release-test-layer`, from and into `develop`.
