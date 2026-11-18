# Testing Strategy

**Source of truth:** `mise.toml` (`test:*` tasks), `.github/workflows/ci.yml`, `supabase/tests/`

What each kind of test covers, where it runs, and the rules for new code. Tests sit next to the code they test, with one framework per language ([stack.md](./stack.md)).

## 1. Layers

| Layer | Scope | Tools | When it runs |
|---|---|---|---|
| Unit | Functions, components, hooks, handlers, with dependencies faked | Vitest + Testing Library (`web/`, `devtools/`: `mise run test:devtools -- src/admin`), `go test -race` (`api/`, `game/`, `golib/`), pytest (`worker/`) | Locally on touched files; every package in CI on each PR |
| Database | RLS policies, grants, and database functions against a real throwaway database | pgTAP via `supabase test db` (`supabase/tests/*.test.sql`) | Locally when `supabase/` changes; CI on each PR that touches `supabase/` |
| Contract | The shared schemas and that generated code matches them | `shared/test/schemas.test.ts`; the CI check that `mise run gen` leaves no diff; `api/internal/rooms/handler_test.go` validates responses against the OpenAPI copy | CI on each PR |
| End-to-end | Critical paths in a browser against a deployed environment: sign in, create room, join by code, buzz, judge, finish a game | Playwright. **Not yet implemented** | Release verification only ([release-strategy.md](../operations/release-strategy.md)) |
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

**Planned, not enforced in CI.** CI collects coverage (`web` runs `test:coverage`; Go jobs write `coverage.out`) but fails on no threshold. A follow-up task adds the thresholds.

| Package | Floor |
|---|---|
| `game/internal/play`, `game/internal/judge`, `golib/` | 80% |
| `api/`, `worker/`, `web/src/lib` | 70% |
| `web/src/pages`, `web/src/game` (components) | 50% |

Coverage is a floor, not a goal: a test that asserts nothing still counts toward it.

## 4. Rules for new code

- **Features and enhancements** ship their tests in the same PR. Tests are never a follow-up task.
- **Every bug fix** includes a regression test that fails before the fix and passes after it.
- **Refactors** keep the existing tests passing unchanged. If the code being moved has no tests, add them before the refactor.
- **Test the build, not only the source.** A module-resolution error in a build can pass every test and still crash at boot. CI has no step yet that starts each service from its build and checks `/healthz`. **Not yet implemented.**

## 5. Where tests run

Locally, run only the tests for what you touched, with `mise run test:*`. CI runs the changed packages on every PR into `develop`, and on each release PR. Commands and the full rule are in [development-workflow.md](./development-workflow.md), "Validation: targeted tests only".
