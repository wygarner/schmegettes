---
task-type: improvement
task-title: "Keep develop quiet and deploy without GitHub Actions"
---
# Task Brief

Implement the quiet-`develop`, action-budget-independent delivery model in [product-brief.md](./product-brief.md). Pull-request CI and task lifecycle workflows remain. A merge to `develop` starts no push, scheduled, or manual-ref workflow. A release merge to `production` still deploys automatically, and the exact same deploy implementation can be run by an authorized operator when GitHub Actions is unavailable.

This is an operations and developer-workflow change. It changes no player flow, gameplay rule, API, WebSocket message, database schema, or runtime service behavior.

## Subtasks

### 1. Build one repository-owned deployment interface

Create a testable Node CLI in `scripts/` and expose it through one `mise` task. It is the only implementation of deployment orchestration; GitHub Actions and a human operator are callers of the same interface.

The command family must support these operations for `staging` and `production`:

- preflight a full deploy or one scope without changing external state
- apply migrations explicitly
- deploy and verify `api` only
- deploy and verify `game` only
- build, deploy, and verify `web` only
- perform a full deploy in order: preflight, migrations, api, game, web, then whole-environment verification

Use a consistent interface documented by `--help`; the recommended shape is:

```text
mise run deploy -- preflight <staging|production> [all|migrate|api|game|web]
mise run deploy -- run <staging|production> <all|migrate|api|game|web>
```

Exact flag parsing may vary, but do not expose separate unrelated commands for Actions and operators.

The CLI must:

1. Resolve the full SHA with `git rev-parse HEAD`, require a clean checkout, and print environment, scope, operation, and SHA before mutation.
2. Validate source provenance before mutation:
   - staging: `HEAD` is an ancestor of the fetched `origin/develop`
   - production: `HEAD` is the current fetched `origin/production` tip
   - a missing or stale remote ref is a preflight error; the command does not fetch or silently select another commit
3. Validate only the tools and variables needed by the requested scope. A full deploy validates everything before migrations start. Never print a secret value.
4. Use the checked-out SHA as `GIT_SHA`, Fly image label, and Fly build argument. Set `APP_ENV` from the selected environment.
5. Apply migrations with the pinned Supabase CLI and that environment's owner URL. Preserve the existing throwaway-signing-key workaround without overwriting an existing local signing key; remove only a temporary file created by this invocation.
6. Deploy `api` and `game` with the existing Fly commands and safety flags. `game` must retain `--ha=false`; both retain remote builds and the 10-minute wait. Tokens are passed through the child process environment and never command arguments or output.
7. Build `web` with the pinned Bun toolchain and the selected environment's public `VITE_*` values, then call `web/scripts/vercel-deploy.mjs` with its Vercel credentials. Production builds compile E2E mode out; staging builds retain staging E2E mode.
8. Verify a component immediately after a component-only deploy. For a full deploy, verify all three components after all deploy steps. Poll for at most 15 minutes and fail unless each JSON version response reports the selected SHA.
9. Use named component version URLs rather than relying on the order of a space-separated list. Add and document `WEB_VERSION_URL`, `API_VERSION_URL`, and `GAME_VERSION_URL` for both GitHub Environments and the operator environment.
10. Track completed stages. On failure, exit nonzero and print a sanitized partial-state summary: which stages completed, which failed, which did not start, and the applicable rollback reference. Never say the environment deployed successfully after a partial failure.
11. Make preflight genuinely side-effect free: no migration, build, provider API call, generated repository file, package install, or deployment.

The authorized operator supplies configuration as process environment variables from their secure secret manager or shell session. The CLI must not read, create, or recommend committed or local `.env` files for staging or production. GitHub Environments remain the production Action's configuration source, but are not the operator's only copy.

**Key files:**

- `scripts/deploy.mjs` (new; orchestration and provider command execution)
- `scripts/deploy.test.mjs` (new; CLI/unit tests with fake command runner, fake fetch, and fake clock)
- `mise.toml`
- `web/scripts/vercel-deploy.mjs` and `web/scripts/vercel-deploy.test.ts` only if a small export or injection seam is needed; keep the existing Vercel upload implementation

### 2. Make production Actions a thin caller and make `develop` inert

Refactor workflow YAML after the CLI exists:

- Delete the push-triggered staging deploy workflow. Staging deployment is operator-run from a selected `develop` commit.
- Remove `schedule` and `workflow_dispatch` from `ci.yml`; CI remains `pull_request`-only for PRs into `develop` or `production`.
- Keep `deploy-prod.yml` triggered by pushes to `production`. Its reusable job checks out the merge commit, installs the pinned tools/dependencies required by the shared CLI, maps production GitHub Environment secrets/variables to the CLI's documented inputs, and runs the full production deployment command.
- A manual production dispatch may remain as an operator convenience, but it must be restricted to `refs/heads/production` and call the same CLI. The zero-budget fallback does not depend on it.
- Replace the multi-job shell implementation in `deploy.yml` with a thin wrapper around the shared deploy command. Do not retain a second migration, Fly, web-build, or version-verification implementation in workflow YAML.
- Retain PR-triggered `create-task-issue.yml` and `task-issue-transitions.yml`. Their manual recovery paths must be documented only on non-`develop` refs (for example, the open spec branch); remove the current recovery instruction that dispatches task creation on `develop`.
- Audit every workflow and repo instruction for a scheduled or manual run from `develop`. Release E2E must run from the release branch (or locally against staging), not by dispatching the default `develop` ref. Staging catalog jobs, if run through Actions, must name a non-`develop` ref. Production catalog jobs continue to use `production`.
- Update CI's changed-package comments and any tests that couple docs-only detection to the deleted staging workflow.

The production workflow must continue to use `environment: production`, retain read-only repository permissions, and pass credentials only through environment variables. The wrapper must not echo them.

**Key files:**

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-staging.yml` (delete)
- `.github/workflows/deploy-prod.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/e2e.yml`, `.github/workflows/load-clues.yml`, `.github/workflows/rate-clues.yml`, `.github/workflows/create-task-issue.yml`, and `.github/workflows/task-issue-transitions.yml` only where a `develop`-ref guard or comment must change
- `.github/scripts/tests/` or `scripts/workflow-policy.test.mjs` (new/updated static policy tests)

### 3. Preserve and exercise rollback without Actions

Keep rollback operator-run and independent of GitHub Actions:

- web: the last good Vercel production deployment can be restored without Actions
- api: deploy the last good labelled Fly image
- game: deploy the last good labelled Fly image with `--ha=false`

Update the rollback instructions so staging and production names are unambiguous, every command uses the pinned toolchain, and the operator verifies the restored component's version afterward. Do not add automatic database rollback; migrations remain additive and forward-only.

The implementation agent does not have release or deployment authority and must not exercise live deploy or rollback commands. A human operator performs the staging acceptance checks in the Test plan and records the result on the implementation PR.

**Key files:**

- `docs/system-docs/operations/deployment.md`
- `docs/system-docs/operations/release-strategy.md`
- shared deploy CLI only if rollback verification is exposed through its non-mutating verify operation

### 4. Reconcile workflow, testing, security, and agent documentation

Update every statement made false by the change. The final documentation must say:

- task branches still start from and target `develop`
- PR CI is still required and path-filtered
- a merge to `develop` updates history and task state but does not deploy or start a push/scheduled workflow
- staging is an explicit promotion of a selected commit reachable from `develop`
- production deploys automatically on a merge to `production`, with the operator CLI as the no-Actions fallback
- release verification deploys the exact selected `develop` commit to staging before E2E and agent QA
- Actions unavailability can block new PR validation, but cannot block deploy or rollback of an already validated commit
- deployment credentials have both GitHub Environment and operator-controlled secure copies, with one owner and one rotation procedure
- implementation agents run targeted tests only and never deploy, migrate hosted databases, or release

Update source-of-truth lines where the new CLI replaces workflow YAML. Remove instructions to dispatch CI, staging deploy, E2E, or task recovery from `develop`. Keep production's automatic trigger and release confirmation steps.

**Key files:**

- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.claude/commands/product.md`
- `.claude/commands/engineering.md`
- `.claude/commands/implement.md`
- `docs/system-docs/engineering/development-workflow.md`
- `docs/system-docs/engineering/branch-strategy.md`
- `docs/system-docs/engineering/testing-strategy.md`
- `docs/system-docs/engineering/stack.md`
- `docs/system-docs/operations/deployment.md`
- `docs/system-docs/operations/release-strategy.md`
- `docs/system-docs/operations/operator-scripts.md`
- `docs/system-docs/security/configuration-and-secrets.md`
- `docs/system-docs/security/security-model.md`
- other directly contradictory documentation found by `rg`

## Contracts preserved

All player and service contracts are preserved:

- no change to `shared/openapi.yaml`
- no change to `shared/schemas/protocol/`
- no change to `shared/schemas/jobs/`
- no generated contract code
- no REST, WebSocket, job, database, or player-visible contract change

The deployment CLI's command-line arguments and environment-variable names are an operator interface. Document them and test their validation, but do not change an application contract to implement them.

## Database migration plan

No database migration. Do not add, drop, rename, grant, or change an RLS policy. The task changes how existing additive migrations are invoked, not their contents.

The deployment test fixtures must never connect to staging or production. Unit tests fake the Supabase process. Only the human staging acceptance test may apply real pending staging migrations, using the existing owner credential and additive-migration rule.

## Logging requirements

No runtime service log changes are expected. The deployment CLI is an operator CLI, so its stdout/stderr is its deliverable and is exempt from structured service logging.

Its output must still follow these safety rules:

- print operation, environment, scope, SHA, stage names, durations/status, and sanitized provider identifiers only
- never print tokens, database URLs, credentials, authorization headers, email addresses, complete child-process environments, full provider response payloads, or command lines containing secrets
- pass secret values through child-process environment only
- sanitize errors before printing; a failed command is identified by stage and exit status, not by dumping its environment
- tests use unmistakably fake credentials and assert they do not appear in success or failure output

## Success criteria

1. Opening or updating a PR into `develop` still starts path-filtered CI and task lifecycle automation; all required checks can pass.
2. Merging a PR into `develop` starts no push-triggered CI or staging deploy, and the workflow inventory has no schedule or documented manual dispatch from `develop`.
3. `mise run deploy -- preflight staging all` (or the documented equivalent) validates commit provenance, tools, and all required configuration without changing files or calling Supabase, Fly, or Vercel.
4. Missing configuration, a dirty checkout, the wrong branch commit, or a missing tool fails preflight before any external mutation and prints no secret.
5. From a clean checkout of a selected commit reachable from `origin/develop`, the human operator can complete a full staging deployment with Actions unavailable: migrations, api, game, web, health/provider waits, and all three exact-SHA checks.
6. The human operator can deploy and verify each of `api`, `game`, and `web` independently. The command reports component scope and does not claim the untouched components run the selected SHA.
7. A simulated migration failure prevents every service deploy. Simulated later-stage failures report the exact partial state and return nonzero. A wrong or unavailable version response fails verification after the documented timeout.
8. Merging an approved release PR to `production` still automatically starts `deploy-prod.yml`; that workflow calls the same full-deploy CLI used locally and verifies the production merge SHA.
9. With Actions unavailable, the human operator can run that same full production command only from a clean checkout at the current fetched `origin/production` tip; preflight rejects `develop`, a release branch, or an older production commit.
10. Operator configuration exists outside GitHub Actions, but no deployment secret or production/staging `.env` file is committed, created by the CLI, printed, or captured in test output.
11. The human operator exercises api, game, and web rollback in staging and verifies the restored versions without Actions. Database state is not rolled back.
12. Workflow comments, system docs, agent instructions, command help, and tests all describe the same model: quiet `develop`, explicit staging promotion, automatic production deployment, and zero-Actions deploy/rollback fallback.

## Test plan

### Automated, targeted tests for the implementation agent

Add Node tests around injected process, filesystem, git, fetch, and clock boundaries. Do not call a hosting provider or hosted database.

Cover at least:

- argument parsing and `--help`
- environment/scope allowlists
- clean-checkout and branch-provenance rules for staging and production
- scope-specific required variables and tools
- preflight makes zero mutating calls and leaves the checkout unchanged
- migration happens before every service in a full deploy
- migration failure starts no component deploy
- exact Fly flags, including `--ha=false` for game and SHA build/image labels for both services
- web build receives the selected environment and SHA before the existing Vercel uploader runs
- component-only deploy verifies only that component and reports mixed environment state honestly
- full verification requires all three named URLs to report the expected SHA
- retry, timeout, HTTP failure, invalid JSON, and wrong-SHA behavior
- partial-state output for api, game, web, and verification failures
- secrets are absent from success and error output
- temporary signing-key cleanup and preservation of a pre-existing file
- static workflow policy: CI has PR triggers but no schedule/push/manual trigger; staging deploy-on-push is absent; production push trigger remains; production workflow calls the shared deploy CLI; no duplicate provider deploy commands remain in workflow YAML

Run:

```bash
mise run test:scripts
mise run test:web -- scripts/vercel-deploy.test.ts   # only if the Vercel helper changes
git diff --check
```

Lint/format touched script and configuration files with the existing repository tooling. Do not run a full package suite.

### Human operator acceptance before implementation merge

These checks require deployment authority and real credentials. The implementation agent prepares commands and records no secrets; Wyatt runs them and adds the outcomes to the PR:

1. With Actions unavailable, preflight and full deploy a selected clean `develop` commit to staging. Confirm migrations precede services and all three version endpoints report the selected SHA.
2. Redeploy api, game, and web one at a time. Confirm each exact-SHA check and the mixed-version summary after the first component.
3. Run preflight once with one required variable intentionally absent. Confirm no external change and no secret in output.
4. Exercise the documented staging rollback for web, api, and game, verify each restored version, then redeploy the selected commit so staging finishes on the intended SHA.
5. Inspect the merged implementation's Actions list: the `develop` push starts no run. Production automatic deployment is verified during the next approved release, not by creating a production merge for this task.

## Docs to update

- `docs/system-docs/engineering/development-workflow.md`
- `docs/system-docs/engineering/branch-strategy.md`
- `docs/system-docs/engineering/testing-strategy.md`
- `docs/system-docs/engineering/stack.md`
- `docs/system-docs/operations/deployment.md`
- `docs/system-docs/operations/release-strategy.md`
- `docs/system-docs/operations/operator-scripts.md`
- `docs/system-docs/security/configuration-and-secrets.md`
- `docs/system-docs/security/security-model.md`
- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.claude/commands/product.md`
- `.claude/commands/engineering.md`
- `.claude/commands/implement.md`
- any other directly contradictory documentation discovered during implementation

No product feature docs change because this task has no player-visible behavior.
