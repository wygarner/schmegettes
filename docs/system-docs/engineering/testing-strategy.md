# Testing Strategy

**Source of truth:** `mise.toml` (`test:*` tasks), `.github/workflows/ci.yml` and `e2e.yml`, `supabase/tests/`, `e2e/`, `scripts/coverage-floors.json`

What each kind of test covers, where it runs, and the rules for new code. Tests sit next to the code they test, with one framework per language ([stack.md](./stack.md)).

## 1. Layers

| Layer | Scope | Tools | When it runs |
|---|---|---|---|
| Unit | Functions, components, hooks, handlers, with dependencies faked | Vitest + Testing Library (`web/`, `devtools/`: `mise run test:devtools -- src/admin`), `go test -race` (`api/`, `game/`, `golib/`), pytest (`worker/`) | Locally on touched files; every package in CI on each PR |
| Database | RLS policies, grants, and database functions against a real throwaway database | pgTAP via `supabase test db` (`supabase/tests/*.test.sql`) | Locally when `supabase/` changes; CI on each PR that touches `supabase/` |
| Contract | The shared schemas and that generated code matches them | `shared/test/schemas.test.ts`; the CI check that `mise run gen` leaves no diff; `api/internal/rooms/handler_test.go` validates responses against the OpenAPI copy | CI on each PR |
| End-to-end | The critical path in a browser against a deployed environment: sign in, create room, join by code, buzz, judge, override, reload, Final, finish a game | Playwright (`e2e/`; see "End-to-end" below) | Release verification only, against staging ([release-strategy.md](../operations/release-strategy.md)) |
| Evals | LLM prompts and judge behaviour | `evals/`. **Not yet implemented** | CI, non-blocking |

Agent QA (an agent driving the real app to confirm a change works) will be described in `quality/agent-qa.md`. **Not yet implemented.**

## 2. Dedicated tests

Two areas have their own tests, and every change to them adds more:

- **Room isolation.** `supabase/tests/rls.test.sql`, plus one file per feature (`lobby.test.sql`, `gameplay.test.sql`, `game_history.test.sql`, `wagers.test.sql`). They prove a player cannot read or write another room's or game's data.
- **Auth guards.**
  - `api/internal/server/server_test.go`: `TestAuthenticate` (no token or a bad token gets 401; `/healthz` needs none) and `TestCORS`.
  - `game/internal/socket/socket_test.go`: `TestRejectsBeforeUpgrade` (no token, no protocol version) and `TestRejectsForeignOrigin`.

Rules:

- Every new protected endpoint or socket message gets a test with no token and one with the wrong role (for example, a contestant sending a host-only message).
- Every new table gets an RLS test in `supabase/tests/`.

## 3. Coverage floors

**Enforced in CI.** A package below its floor fails its job.

| Package | Floor | Where it's checked |
|---|---|---|
| `game/internal/play`, `game/internal/judge` | 80% | `game` job: `scripts/coverage-floor.cjs` on `coverage.out` |
| `golib/` | GOLIB_FLOOR | `game` job's golib step |
| `api/` (all packages, statement-weighted) | API_FLOOR | `api` job |
| `worker/` | WORKER_FLOOR | `worker` job: `pytest --cov-fail-under` |
| `web/src/lib` | 70% | `web` job: vitest `coverage.thresholds` (`web/vite.config.ts`) |
| `web/src/pages`, `web/src/game` (components) | 50% | the same |

Go floors live in `scripts/coverage-floors.json` (a key ending in `/` is a prefix measured as one group). Coverage is a floor, not a goal: a test that asserts nothing still counts toward it.

STEP_UPS

## 4. Rules for new code

- **Features and enhancements** ship their tests in the same PR. Tests are never a follow-up task.
- **Every bug fix** includes a regression test that fails before the fix and passes after it.
- **Refactors** keep the existing tests passing unchanged. If the code being moved has no tests, add them before the refactor.
- **Test the build, not only the source.** A module-resolution error in a build can pass every test and still crash at boot. CI's `boot` job builds the api and game images from their Dockerfiles, starts them against a local Supabase, and requires `/healthz` within 30 s; it serves the production web build with `vite preview` and loads Home, failing on any console error (`e2e/tests/boot.spec.ts`). It runs when api, game, web, shared or e2e changes.

## 5. Where tests run

Locally, run only the tests for what you touched, with `mise run test:*`. CI runs the changed packages on every PR into `develop`, and on each release PR. Commands and the full rule are in [development-workflow.md](./development-workflow.md), "Validation: targeted tests only".

## 6. End-to-end

`e2e/tests/critical-path.spec.ts` plays one whole game: a signed-in host at 844 × 390 and two guest phones at 390 × 844, with Double Schmegettes off. It checks each step on every screen it should show on: the first buzz is judged, a wrong answer reopens buzzing, the host's override marks an answer correct, a phone reloads and is back with its score, a Daily Double is wagered and answered, both finalists wager and type a Final answer, the standings show on each phone, and the game is in My games. It takes about 5 minutes.

**E2E mode.** Headless Chromium can't play the narrator or recognize speech, so the pages run with `?e2e=1`: narration ends at once with nothing downloaded, and `window.__e2e.say(text)` is what the phone's microphone hears, sent through the real answer path (`web/src/lib/e2e.ts`). It exists only on the Vite dev server and in staging builds (`VITE_ENV=staging`); production builds compile it out, and CI's `web` job fails if `__e2e` is in a production bundle. Correct responses never reach phones, so the suite makes an answer right the way a host would: with an override.

**Run it**

- Staging (release verification): `gh workflow run e2e.yml`. Reports and traces are uploaded as the `e2e-report` artifact on failure.
- Locally, against `mise run dev`: `E2E_HOST_EMAIL=e2e-host@example.test E2E_HOST_PASSWORD=<any 8+ characters> E2E_HOST_CODE=DEVSTEST mise run test:e2e`. With `E2E_HOST_CODE` set, the first run creates the host account and gives it host access with the local code.

**The E2E host account** (staging, once, by hand). The suite never reads a host code or holds admin credentials; the host is a signed-in account that already has host access, which never expires.

1. In a private window on the staging web app, **Create account** with the E2E email and a generated password.
2. Read the current code on the devtools Admin page (staging) and enter it on that account's host code sheet.
3. Optionally, set the host's note on the Admin page to "E2E host (do not remove)".
4. Store `E2E_HOST_EMAIL` (variable) and `E2E_HOST_PASSWORD` (secret) in the GitHub `staging` environment.

Until then, `e2e.yml` stops with "E2E_HOST_EMAIL / E2E_HOST_PASSWORD not set on staging". Games it plays stay in staging's history under that account and two fresh guests.
