---
task-type: improvement
task-title: "Deploy and roll back without depending on GitHub Actions"
---
# Task Brief

Implement the resilience-only model in [product-brief.md](./product-brief.md), revised 2026-11-23. Today the full deploy logic lives in the multi-job shell of `.github/workflows/deploy.yml`. This task moves it into one tested repository command. The staging and production workflows become thin callers of that command, with their triggers unchanged. An authorized operator can run the same command from a clean checkout when Actions is unavailable, for a full deploy or for one component.

This is an operations change. It changes no player flow, gameplay rule, API, WebSocket message, database schema, or runtime service behaviour. **No workflow trigger changes**: merging to `develop` still deploys staging, merging to `production` still deploys production, and CI keeps its `pull_request`, weekly `schedule`, and `workflow_dispatch` triggers.

## Subtasks

### 1. Build one repository-owned deployment command

Create a testable Node CLI in `scripts/` and expose it through one `mise` task. It is the only implementation of deploy orchestration; GitHub Actions and a human operator are both callers.

It supports `staging` and `production`, and these operations:

- preflight a full deploy or one scope without changing anything external
- apply migrations explicitly
- deploy and verify `api` only
- deploy and verify `game` only
- build, deploy, and verify `web` only
- full deploy in order: preflight, migrations, api, game, web, then whole-environment verification
- verify only (no mutation), used after a rollback

Recommended shape, documented by `--help`:

```text
mise run deploy -- preflight <staging|production> [all|migrate|api|game|web]
mise run deploy -- run       <staging|production> <all|migrate|api|game|web>
mise run deploy -- verify    <staging|production> [all|api|game|web] [--sha <full sha>]
```

Exact flag parsing may vary. There must not be separate commands for Actions and operators.

The CLI must:

1. Resolve the full SHA with `git rev-parse HEAD`, require a clean checkout, and print operation, environment, scope, and SHA before any mutation.
2. Validate provenance before any mutation:
   - staging: `HEAD` is an ancestor of the fetched `origin/develop`;
   - production: `HEAD` equals the fetched `origin/production` tip;
   - a missing or stale remote ref is a preflight error. The command never fetches on its own or picks another commit. (Workflows fetch the ref before calling it; see subtask 2.)
3. Validate only the tools and variables the requested scope needs. A full deploy validates everything before migrations start. Never print a secret value.
4. Use the checked-out SHA as `GIT_SHA`, the Fly image label, and the Fly build argument. Set `APP_ENV` from the environment.
5. Apply migrations with the pinned Supabase CLI and that environment's owner URL. Keep today's throwaway-signing-key workaround, but never overwrite an existing local signing key, and remove only a temporary file this invocation created.
6. Deploy `api` and `game` with today's Fly commands and safety flags. `game` keeps `--ha=false`, and both keep remote builds and the 10-minute wait. Tokens go through the child-process environment only, never through arguments or output. Keep the separate `FLY_API_TOKEN_API` / `FLY_API_TOKEN_GAME` credentials.
7. Build `web` with the pinned Bun toolchain and the environment's public `VITE_*` values, then call `web/scripts/vercel-deploy.mjs` with its Vercel credentials. Production builds compile E2E mode out, and staging builds keep staging E2E mode, as today.
8. Verify a component right after a component-only deploy. For a full deploy, verify all three after every deploy step has finished. Poll for at most 15 minutes, and fail unless each JSON version response reports the expected SHA.
9. Use named version URLs instead of a space-separated list: `WEB_VERSION_URL`, `API_VERSION_URL`, `GAME_VERSION_URL`. Add them to both GitHub Environments (a human step, listed on the PR) and the operator configuration docs.
10. Track completed stages. On failure, exit nonzero and print a sanitized partial-state summary: which stages completed, which failed, which never started, and the rollback reference that applies. Never report the environment deployed after a partial failure.
11. Make preflight free of side effects: no migration, build, provider API call, generated repository file, package install, or deploy.
12. Say plainly when a component-only deploy leaves the environment on mixed SHAs. It never claims the untouched components run the selected SHA.

The operator supplies configuration as process environment variables from their secure secret manager or shell session. The CLI must not read, create, or recommend `.env` files for staging or production.

**Key files:**

- `scripts/deploy.mjs` (new)
- `scripts/deploy.test.mjs` (new; fake command runner, fake fetch, fake clock)
- `mise.toml` (the `deploy` task)
- `web/scripts/vercel-deploy.mjs` and `web/scripts/vercel-deploy.test.ts`, only if a small export or injection seam is needed. Keep the existing upload implementation.

### 2. Turn the deploy workflows into thin callers

Leave every `on:` block exactly as it is. Change only job bodies:

- `deploy.yml` (reusable): replace the migrate, api, game, web, and verify jobs with one job per environment that:
  - checks out the triggering commit;
  - fetches the provenance ref (`origin/develop` for staging, `origin/production` for production) with enough depth for the ancestor check;
  - installs the pinned tools through mise;
  - maps that GitHub Environment's secrets and variables onto the CLI's documented inputs;
  - runs `run <environment> all`.

  No migration, Fly, web-build, or version-check logic remains in YAML. Keep `environment: ${{ inputs.environment }}`, read-only `contents` permission, and secrets passed only through `env:`.
- `deploy-staging.yml`: unchanged trigger (push to `develop` with the current `paths-ignore`, plus `workflow_dispatch`). It keeps calling `deploy.yml` with `staging`.
- `deploy-prod.yml`: unchanged trigger and `refs/heads/production` guard. It keeps calling `deploy.yml` with `production`.
- `ci.yml`: no trigger change. Update only the changed-package comments or path filters that refer to `deploy.yml` internals, if any.

A staging push that lands while an earlier staging deploy is still running must not interleave with it. Keep or add a per-environment `concurrency` group without cancel-in-progress.

**Key files:** `.github/workflows/deploy.yml`, plus `deploy-staging.yml`, `deploy-prod.yml`, and `ci.yml` only where a comment or `concurrency` block needs to change.

### 3. Rollback without Actions

Keep rollback operator-run and independent of Actions:

- web: restore the last good Vercel deployment;
- api: deploy the last good labelled Fly image;
- game: deploy the last good labelled Fly image with `--ha=false`.

Rewrite the rollback instructions with unambiguous staging and production names and the pinned toolchain. Each rollback ends with `mise run deploy -- verify <env> <component> --sha <restored sha>`. Don't add database rollback; migrations stay additive and forward-only.

The implementation agent has no deploy authority and must not run live deploy, migration, or rollback commands. Wyatt runs the staging acceptance checks and records the results on the implementation PR.

**Key files:** `docs/system-docs/operations/deployment.md`, `docs/system-docs/operations/release-strategy.md`

### 4. Documentation

Update every statement the change makes false. The final docs must say:

- staging and production deploy automatically, as before, through the shared command;
- the operator can run the same command, full or by component, when Actions is unavailable;
- every operator deploy command, environment input, and failure output;
- that deploy credentials have a GitHub Environment copy and an operator-controlled secure copy, with one owner and one rotation procedure;
- that implementation agents never deploy, migrate hosted databases, or release.

**Key files:** `docs/system-docs/operations/deployment.md`, `docs/system-docs/operations/release-strategy.md`, `docs/system-docs/operations/operator-scripts.md`, `docs/system-docs/security/configuration-and-secrets.md`, `docs/system-docs/engineering/stack.md` (deploy source-of-truth line)

## Contracts preserved

- no change to `shared/openapi.yaml`, `shared/schemas/protocol/`, or `shared/schemas/jobs/`
- no generated code
- no REST, WebSocket, job, database, or player-visible change
- no workflow trigger change

The CLI's arguments and environment-variable names are a new operator interface. Document them and test their validation.

## Database migration plan

No migration. The task changes how existing additive migrations are invoked, not what they contain. Tests never connect to staging or production; they fake the Supabase process.

## Logging requirements

No runtime service log changes. The CLI's stdout and stderr are its deliverable, so it is exempt from structured service logging, but it must:

- print operation, environment, scope, SHA, stage names, durations and status, and sanitized provider identifiers only;
- never print tokens, database URLs, credentials, authorization headers, emails, full child-process environments, full provider responses, or command lines that contain secrets;
- pass secrets through the child-process environment only;
- sanitize errors: identify a failure by stage and exit status, without dumping its environment.

Tests use unmistakably fake credentials and assert they don't appear in success or failure output.

## Success criteria

1. Merging a code PR to `develop` still triggers `deploy-staging.yml` automatically, which runs the shared command and verifies the merge SHA on all three components.
2. Merging a release PR to `production` still triggers `deploy-prod.yml`, which runs the same command and verifies the production merge SHA.
3. No workflow YAML keeps its own migration, Fly deploy, web build or upload, or version-check implementation, and no `on:` block has changed (verified by diff and by the policy test).
4. `preflight staging all` validates provenance, tools, and configuration with zero mutating calls.
5. A dirty checkout, the wrong branch commit, a missing tool, or missing configuration fails preflight before any external change, and the output contains no secret.
6. With Actions unavailable, Wyatt completes a full staging deploy from a clean commit reachable from `origin/develop`: migrations, api, game, web, and all three SHA checks.
7. api, game, and web each deploy and verify alone, and the output reports mixed-SHA state.
8. A simulated migration failure starts no service deploy. Later-stage failures report exact partial state and exit nonzero. A wrong or unreachable version fails after the timeout.
9. Production runs from the operator only at the current `origin/production` tip; preflight rejects `develop`, a release branch, or an older production commit.
10. No deploy secret or staging/production `.env` file is committed, created, printed, or captured in test output.
11. Wyatt exercises api, game, and web rollback in staging without Actions and confirms each with `verify`.

## Test plan

### Implementation agent (targeted only)

Tests inject process, filesystem, git, fetch, and clock. They make no provider or hosted-database calls. Cover:

- argument parsing, `--help`, and environment and scope allowlists;
- clean-checkout and provenance rules for both environments;
- required variables and tools for each scope;
- preflight makes zero mutating calls and leaves the checkout unchanged;
- migrations run before every service in a full deploy, and a migration failure starts no service;
- exact Fly flags, including `--ha=false` for game and the SHA label and build argument for both services;
- the web build receives the environment and SHA before the Vercel uploader runs;
- a component-only deploy verifies only that component and reports mixed state;
- full verification needs all three named URLs to match;
- retry, timeout, HTTP error, invalid JSON, and wrong-SHA handling;
- partial-state output for each failing stage;
- secrets absent from all output;
- signing-key temp file is cleaned up, and an existing file is preserved;
- static check: `deploy.yml` invokes the shared command and contains no `flyctl`, `supabase db push`, `vercel-deploy`, or `/version` polling of its own, and the `on:` blocks of `ci.yml`, `deploy-staging.yml`, and `deploy-prod.yml` keep their current triggers.

```bash
mise run test:scripts
mise run test:web -- scripts/vercel-deploy.test.ts   # only if the Vercel helper changes
git diff --check
```

### Human acceptance before the implementation merge (Wyatt)

1. Without Actions: run preflight, then a full deploy of a selected clean `develop` commit to staging. Confirm migrations ran first and all three versions match.
2. Redeploy api, game, and web one at a time, and confirm each SHA check and the mixed-state summary.
3. Run preflight with one required variable missing, and confirm nothing changed and no secret was printed.
4. Roll back web, api, and game in staging, `verify` each, then redeploy the selected commit.
5. After the merge: confirm the automatic staging deploy ran through the shared command and verified the merge SHA. Production's automatic path is confirmed at the next approved release.

## Docs to update

- `docs/system-docs/operations/deployment.md`
- `docs/system-docs/operations/release-strategy.md`
- `docs/system-docs/operations/operator-scripts.md`
- `docs/system-docs/security/configuration-and-secrets.md`
- `docs/system-docs/engineering/stack.md`

No product feature docs change.

## Branch
`technical-improvement/GH-300-action-budget-independent-delivery`, from and into `develop`
