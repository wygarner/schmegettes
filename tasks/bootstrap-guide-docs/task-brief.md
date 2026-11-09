---
jira-type: improvement
jira-title: "System docs required by the bootstrap guide v2 (security, testing, config, comms)"
---

# Task spec: bootstrap-guide-docs

Docs only. No code, config, migration, or contract changes. Product brief: `tasks/bootstrap-guide-docs/product-brief.md`. Reference: Everlo-Software/global `new-project-bootstrap-guide-v2.md` §3, §5, §7, §9, §10, §12 (read it with `gh api repos/Everlo-Software/global/contents/new-project-bootstrap-guide-v2.md -H "Accept: application/vnd.github.raw"`).

## Decisions (made by the human on 2026-11-09)

| # | Decision |
|---|---|
| 1 | Error tracking uses **Grafana**. Web: Grafana Faro. Servers: error counters plus logs in Grafana Cloud, no separate hosted tracker. |
| 2 | Config switches are **environment variables**. A restart to pick up a new value is acceptable. |
| 3 | **RPO 24 hours, RTO 4 hours.** |
| 4 | **Wyatt Garner is on call.** The alert contact point (email, phone push, or chat) is not chosen yet. |
| 5 | Players are told through **in-app notices**, plus a status page once hosting exists. |

Writing rules for every doc in this task:

- Present tense only for what the code does today. Mark everything else **Not yet implemented** or **Decision needed**.
- No secret values, tokens, or real hostnames. Variable names only.
- Plain, short sentences, matching the existing docs' style.

## Subtasks

Ordered narrow → wide. There are no `shared/`, `supabase/`, service, or `web/` changes.

### 1. `stack.md`: add the missing rows

File: `docs/system-docs/engineering/stack.md`

Rename the existing "Observability backend" row to **"Log, metric, and trace backend; retention and access"** and keep its "Not yet implemented" marking. Add:

- **Retention:** the Grafana Cloud plan default. Write "to be confirmed when the Grafana Cloud stack is created", not a number.
- **Access:** Wyatt only.

Add these rows to the Decisions table, after the observability row:

| Area | Decision | Why |
|---|---|---|
| Error tracker (server and client) | Decision 1. **Not yet implemented.** | One backend for logs, metrics, traces, and errors. |
| Alert routing, uptime checks, and who is on call | Grafana Alerting, with rules kept as code in the repo. An uptime check from outside the hosting platform on each public `/healthz`. On call: Wyatt Garner. Contact point: **Decision needed.** **Not yet implemented.** | A service can't report its own death; alerts must reach a human without anyone watching a dashboard. |
| Backup, off-account export, RPO and RTO | Supabase managed backups. Scheduled logical export (`pg_dump`) to storage in a separate account: **Not yet implemented**. RPO 24 h, RTO 4 h (decided 2026-11-09). | A party game with no payments can lose a day of history; the export covers a lost or compromised Supabase account. |
| Config switch mechanism | Decision 2. Switches are listed in [configuration-and-secrets.md](../security/configuration-and-secrets.md). | No flag service to run. A restart is fast enough for this product. |

Update the "Last updated" line.

### 2. `security/configuration-and-secrets.md` (new)

File: `docs/system-docs/security/configuration-and-secrets.md`

Sections:

1. **Source of truth:** `api/.env.example`, `game/.env.example`, `web/.env.example`, `worker/.env.example`, `.github/workflows/deploy-prod.yml`, `.github/workflows/ci.yml`.
2. **Variables per package.** Build one table from the four `.env.example` files. Columns: name, package(s), secret yes/no, where it lives (local `.env`, host secret store, GitHub Environment `production`, repo secret).
   - `VITE_*` values are public: they are bundled into the client.
   - `DATABASE_OWNER_URL` is used by the worker's import jobs only.
3. **CI and operator secrets:**
   - `PROD_SUPABASE_DB_OWNER_URL` and the `PROD_VERSION_URLS` variable (GitHub Environment `production`)
   - `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` (repo secrets)
   - `ANTHROPIC_API_KEY` (repo secret, used by the evals job)
4. **Owner and rotation.** One row per secret. Owner: Wyatt Garner. Rotation steps:
   - `app_service` DB password: `alter role app_service with login password …` in each Supabase project, then update every host's `DATABASE_URL`.
   - Owner DB URL: reset the database password in Supabase, then update the GitHub Environment secret.
   - JWT signing keys: Supabase asymmetric key rotation. Services read the JWKS, so a rotation needs no redeploy; confirm that against `golib/auth`.
   - `REDIS_URL` credentials: rotate in the Redis provider.
   - `ANTHROPIC_API_KEY`: new key in the console, revoke the old one.
   - `JIRA_API_TOKEN`: new Atlassian token, revoke the old one.

   When to rotate (guide §7):
   - when someone with access leaves
   - on any suspected exposure, including a secret committed to git, even if the file was later deleted

   Prefer short-lived tokens. Don't write a new secret version on every read.
5. **Observability credentials, three kinds** (guide §5):
   - shipping credentials, runtime config per server-side service
   - the Faro collector key, public-safe and bundled into `web`
   - operator and CI tokens (alert provisioning, source-map upload), kept in CI secrets only

   All **Not yet implemented**.
6. **Config switches.** Columns: name, default, what turning it off does, who may change it, how to turn it off (one command, then restart). Start with **"None yet."** Add the rule that every risky feature and every external integration gets a switch when it is built. The first expected one is the LLM appeal judge in `worker/` (**Not yet implemented**). Include the guide's staged-enforcement and switch-removal rules.
7. **Never:**
   - secrets in `.claude/settings*.json`, commits, or CI logs
   - approvals for commands that carry a token go in `.claude/settings.local.json`

Then in `docs/system-docs/operations/deployment.md`, replace the "Environment variables" secrets table with one sentence linking here. Keep the `VITE_*` public-values sentence.

### 3. `security/security-model.md` (new)

File: `docs/system-docs/security/security-model.md`

Sections:

1. **Source of truth:**
   - `golib/auth/`, `golib/db/`
   - `api/internal/server/`, `game/internal/socket/`
   - `supabase/migrations/`
   - `.claude/settings.json`, `.github/workflows/`
2. **Trust boundaries.** A table with one row per component: web, api, game, worker, Supabase Postgres, Supabase Auth, Redis, CI (GitHub Actions), agents (Claude). Columns: who can call it, how it authenticates the caller, what it can reach. Facts to use:
   - api and game verify the Supabase JWT against the JWKS on every request and socket connect. The game socket carries the token in `Sec-WebSocket-Protocol` and checks Origin.
   - Services connect to Postgres as `app_service`. Every query runs through `db.AsUser` (role `authenticated` plus JWT claims), so RLS applies. `game/` also uses `AsEngine` (role `game_engine`) for the `SECURITY DEFINER` game functions.
   - The worker has no inbound traffic. Only its import jobs use the owner role.
   - **Services do not call each other.** api returns the game socket URL to the client; services share state only through Postgres, pgmq, and Redis. Service-to-service tokens (guide §7) therefore don't apply. Revisit this if a direct call is ever added.
   - CI holds production credentials only inside the GitHub Environment `production` (`deploy-prod.yml`).
   - Agents: `.claude/settings.json` denies force-push, pushes to `production`/`develop`, `supabase db push` and `link`, Jira API calls, and reading `.env` files. Agents never call the Jira API.
3. **Roles.**
   - Identity: anonymous player (Supabase anonymous sign-in) and linked player.
   - Room: `host`, `contestant`, `spectator` (`public.player_role`).
   - Database: `authenticated`, `app_service`, `game_engine`, owner.

   For each role, one line on what it can do and where that is enforced.
4. **Isolation.** Two sentences and a link to `architecture/data-and-isolation.md`. Don't repeat it.
5. **Known gaps.** Each gap gets one line on what is missing and its planned approach. Keep the list current; a PR that closes a gap removes it.
   - Rate limits: sign-in, anonymous sign-up, room join by code, the api. Key by IP and by user; read the IP only from the host's trusted header.
   - Audit table: role and membership changes, credential changes, staff access. Append-only; a failed write raises a critical alert.
   - Staff access to a room or player: explicit, time-limited, audited.
   - Security-header and CORS tests for `web` (CORS is tested in `api/internal/server/server_test.go` and the game Origin check in `game/internal/socket/socket_test.go`, so `web` headers are the gap).
   - Telemetry shipping and the Faro client tracker (Decision 1).
   - First security assessment before launch, with findings in `docs/security-assessments/{date}/remediation-tracker.md`.
   - Docs that depend on choosing hosts: `observability.md`, `incident-response.md`, `disaster-recovery.md`, `data-retention.md`, `operator-scripts.md`, `quality/agent-qa.md`.
   - LLM appeal judge (when built): player answers are untrusted input; tools get least privilege.
6. **Scans:**
   - Already in `ci.yml`: gitleaks, `bun audit`, `govulncheck`, `pip-audit`, plus Dependabot.
   - Still to do: make `CI Complete` a required check on `production`. Check the current branch protection with `gh api repos/{repo}/branches/production/protection` and write what it says; don't guess.

### 4. `engineering/testing-strategy.md` (new)

File: `docs/system-docs/engineering/testing-strategy.md`

Sections:

1. **Source of truth:** `mise.toml` (`test:*` tasks), `.github/workflows/ci.yml`, `supabase/tests/`.
2. **Layers.** A table matching guide §9.1, filled with this repo's tools:
   - unit: Vitest + Testing Library, `go test -race`, pytest
   - database and integration: pgTAP via `supabase test db`, on a throwaway database in CI
   - contract: `shared/test/schemas.test.ts`, the generated-code staleness check, and api handler tests that validate responses against the OpenAPI copy
   - end-to-end: Playwright, release verification only, **Not yet implemented**
   - evals: `evals/`, non-blocking, **Not yet implemented**

   Agent QA: one line saying it is covered in the future `quality/agent-qa.md` (**Not yet implemented**).
3. **Dedicated tests:**
   - Room isolation: `supabase/tests/rls.test.sql` and the per-feature `*.test.sql` files.
   - Auth guards: `api/internal/server/server_test.go` (`TestAuthenticate`, no token or a bad token → 401) and `game/internal/socket/socket_test.go` (`TestRejectsBeforeUpgrade`, `TestRejectsForeignOrigin`).
   - Rule: every new protected endpoint or socket message gets a no-token and a wrong-role test. Every new table gets an RLS test.
4. **Coverage floors.** **Planned, not enforced in CI** (a follow-up task wires the thresholds). Proposed:
   - `game/internal/play`, `game/internal/judge`, `golib/`: 80%
   - `api/`, `worker/`, `web/src/lib`: 70%
   - `web/src/pages`, `web/src/game` components: 50%

   Coverage is a floor, not a goal.
5. **Rules for new code** (guide §9.2):
   - features ship their tests in the same PR
   - every bug fix gets a regression test that fails before the fix
   - refactors keep the existing tests unchanged, and add tests first if the code being moved has none
   - test the build, not only the source: CI has no build-and-boot smoke step yet (**Not yet implemented**)
6. **Where tests run:** targeted locally with `mise run test:*`; the full suite in CI on the daily PR. Link `development-workflow.md`, "Validation". Don't repeat the commands.

### 5. `release-strategy.md`: communication table, plus mark Grafana as not yet built

File: `docs/system-docs/operations/release-strategy.md`

Add a `## Communication` section after `## Rollback` with the guide §12 table and an **Owner** column (Wyatt Garner on every row). Adapt the rows:

| Event | Audience | Channel | Timing |
|---|---|---|---|
| Release | Players | `user-release-notes.md`, shown as an in-app notice (**Not yet implemented**) | After sign-off (step 7) |
| Planned maintenance or downtime | Players | In-app notice; status page once hosting exists | Decision needed: how many days ahead |
| Incident players notice | Affected players | In-app notice; status page once hosting exists | Decision needed: update interval |
| Security or privacy incident | Affected players, and regulators where required | As the law requires | Within the legal deadline |

Drop the guide's "Support" and "Internal team" rows: there is no separate support team or internal team. Say so in one sentence. Add the guide's three message rules:

- say what is affected, what the player should do, and when the next update comes
- never include another player's data
- after a postmortem, send a short follow-up to players who noticed the incident

In Process step 6, mark "Grafana dashboards, error rates" as **Not yet implemented** (link `stack.md`). Until then, health means `/healthz` on every component plus a manual check of the critical paths.

### 6. `development-workflow.md`: doc-accuracy rules, plus fix stale commands

File: `docs/system-docs/engineering/development-workflow.md`

- Add a `## Keeping docs accurate` section before "Automation map", with the guide §10 rules:
  - when docs and code disagree, the code wins: fix the doc in the same PR, unless the code is the bug (then open a `bug-fix` task)
  - every implementation PR updates the docs it makes untrue, listed in the spec's "Docs to update"
  - each system doc names its source of truth at the top
  - unbuilt work is marked "Not yet implemented"; plans are never written in the present tense
  - audit the docs against the code before each minor release
- Fix the "Validation" examples. Use the usage strings in `mise.toml`:
  - `mise run test:api -- ./internal/rooms/...` replaces the stale Rails path `test/controllers/rooms_controller_test.rb`
  - `mise run test:game -- ./internal/room/...`
  - `mise run test:worker -- tests/test_clue_import.py`

### 7. Source-of-truth lines on every system doc

Add one line under each H1 of the existing docs: `**Source of truth:** {files}`. Pick the files that implement each doc. Suggested:

| Doc | Source of truth |
|---|---|
| `README.md` | — (index; skip) |
| `architecture/api-contract.md` | `shared/openapi.yaml`, `shared/schemas/` |
| `architecture/data-and-isolation.md` | `supabase/migrations/`, `golib/db/` |
| `architecture/realtime-game-server.md` | `game/` |
| `architecture/system-overview.md` | `mise.toml`, each package's entry point |
| `engineering/branch-strategy.md` | `.github/workflows/`, `scripts/daily-merge-guard.cjs` |
| `engineering/developer-setup.md` | `mise.toml`, `*/.env.example`, `supabase/config.toml` |
| `engineering/development-workflow.md` | `.github/workflows/`, `.github/scripts/`, `.github/jira.json` |
| `engineering/stack.md` | `mise.toml`, package manifests |
| `operations/deployment.md` | `.github/workflows/deploy-prod.yml` |
| `operations/logging-conventions.md` | `golib/logging/`, `worker/src/schmegettes_worker/__main__.py`, `api/internal/server/server.go` |
| `operations/release-strategy.md` | `scripts/release-scope.cjs`, `.github/workflows/deploy-prod.yml` |

Check that each path exists (`git ls-files`) before writing it.

### 8. `docs/system-docs/README.md`: index

Add rows for Security model, Configuration and secrets, and Testing strategy.

## Key files

- `docs/system-docs/engineering/stack.md`
- `docs/system-docs/engineering/testing-strategy.md` (new)
- `docs/system-docs/engineering/development-workflow.md`
- `docs/system-docs/security/security-model.md` (new)
- `docs/system-docs/security/configuration-and-secrets.md` (new)
- `docs/system-docs/operations/release-strategy.md`
- `docs/system-docs/operations/deployment.md`
- `docs/system-docs/README.md`
- every other `docs/system-docs/**/*.md` (source-of-truth line only)

## Contracts preserved

All of them. Nothing in `shared/`, `supabase/`, or any package changes.

## Success criteria

- [ ] The five decisions above appear in the docs exactly as stated. The contact point and the two communication timings are marked **Decision needed**.
- [ ] Every statement about current behaviour matches the code; everything else is marked **Not yet implemented** or **Decision needed**.
- [ ] Every system doc except the README has a "Source of truth" line, and every path in it exists.
- [ ] `deployment.md` no longer has its own secrets table; it links `configuration-and-secrets.md`.
- [ ] `development-workflow.md` has no Rails paths.
- [ ] No secret values, tokens, or real hostnames in any doc.
- [ ] Every relative link in changed docs resolves.

## Test plan

Docs only, so there are no package tests. Run:

```bash
# every relative link in changed docs resolves
for f in $(git diff --name-only origin/daily/$(date +%F) -- docs); do
  grep -oE '\]\(\.[^)#]*' "$f" | sed 's/^](//' | while read -r p; do
    [ -e "$(dirname "$f")/$p" ] || echo "BROKEN $f -> $p"; done; done
# no stale Rails path
! git grep -n 'rooms_controller_test.rb' -- docs
# no likely secrets
git diff origin/daily/$(date +%F) -- docs | grep -iE '^\+.*(eyJ|sk-ant-|password=|postgres://[^ ]*:[^ ]*@)' && echo "CHECK FOR SECRETS"
```

CI's `docs_only` filter skips every check for this PR, so these commands are the only validation.

## Database migration plan

None.

## Logging requirements

None. No logs or failure paths change.

## Docs to update

All of this task's changes are docs (subtasks 1–8).
