---
task-type: improvement
task-title: "Keep develop quiet and deploy without GitHub Actions"
---
**Task Type:** Improvement. This changes engineering workflow and operations, not player-facing behavior.

**Product docs:** No durable player-product documentation changes. Update the system documentation that defines testing, branching, deployment, release, security, secrets, and agent workflow, including:

- `docs/system-docs/engineering/development-workflow.md`
- `docs/system-docs/engineering/branch-strategy.md`
- `docs/system-docs/engineering/testing-strategy.md`
- `docs/system-docs/operations/deployment.md`
- `docs/system-docs/operations/release-strategy.md`
- `docs/system-docs/security/configuration-and-secrets.md`
- `docs/system-docs/security/security-model.md`
- `AGENTS.md` and the Product/Engineering agent instructions where they repeat the old rules

**Decision (Wyatt Garner, 2026-11-22): quiet `develop`.** GitHub Actions may run for pull-request events whose base is `develop`, including CI and task-issue lifecycle automation. No workflow runs because a commit was pushed or merged to `develop`, no scheduled workflow runs from `develop`, and no manual workflow is dispatched from the `develop` ref. Merging a PR into `develop` itself consumes no Actions budget.

**Problem:** Today a code merge to `develop` automatically runs the staging deployment workflow. Weekly CI also runs from the repository's default branch, and several operator workflows are documented as manual runs on `develop`. This has three consequences:

- A merge spends Actions budget after the PR has already been validated.
- Staging deployment depends on Actions availability and quota.
- The only complete deployment path is encoded around GitHub Environments and workflow jobs. If Actions has no remaining budget, staging and production cannot be deployed through the documented path even though Fly.io, Vercel, and Supabase are available.

Schmegettes must keep PR validation and task automation, while making `develop` inert after merge and making deployment independent of GitHub Actions.

**Considered options:**

1. **Quiet `develop` (selected).** Keep PR CI and task lifecycle Actions; remove every push, schedule, and `develop`-ref manual run. Make an operator-run deployment path canonical. This preserves review gates and costs nothing when a PR merges.
2. **No Actions involving `develop`.** Move PR CI and task tracking local too. This saves more budget but removes the existing shared validation result and requires a new issue-state system.
3. **A staging promotion branch.** Trigger Actions when a separate long-lived branch advances. This keeps automatic staging but adds branch state and still makes deployment depend on Actions budget.

**Outcomes:**

- **A merge to `develop` is inert.** It starts no CI, deployment, issue, scheduled, or operator workflow. PR-close task transitions are allowed because they are PR-event automation; they must not cause a second push-triggered run when the merge lands.
- **PRs remain the quality gate.** Pull requests into `develop` keep path-filtered package tests, build/boot validation, contract-generation checks, security checks, and task-issue lifecycle automation. Targeted local validation remains required before opening a PR. Docs-only PRs keep their lightweight path.
- **No weekly run on `develop`.** Remove the scheduled full CI run or move the underlying need to a mechanism that does not execute from `develop`. This task does not add a replacement CI provider.
- **Staging is explicitly promoted.** A merge no longer means staging changed. The operator chooses when to deploy a known `develop` commit and can tell, from the command output and `/version`, which commit staging runs. Release verification must name and deploy the exact `develop` commit being released before E2E and staging agent QA.
- **Deployment needs zero Actions budget.** From a clean checkout of the intended commit, an authorized operator can deploy staging or production without starting, calling, or waiting for a GitHub Actions workflow. The path works when Actions is disabled or its quota is exhausted.
- **Every currently deployable component has an independent path.** The operator can deploy the complete environment and can deploy only `web`, only `api`, or only `game` when that component alone needs recovery. Database migrations can be run as their own explicit operation and are included automatically in a complete environment deployment. `worker` and `devtools` are not hosted services today; before either becomes hosted, it must gain the same action-independent full and component deployment path.
- **The deploy contract does not weaken.** A complete deployment, whether staging or production:
  1. verifies the checkout is the intended branch commit and records its full SHA;
  2. applies additive database migrations before new code receives traffic;
  3. builds each component from that checkout with the same SHA;
  4. waits for platform health checks;
  5. verifies every deployed `/version` endpoint (and web `/version.json`) reports that SHA; and
  6. exits nonzero at the first failed stage, naming what deployed and what did not.
- **A component deploy is safe and honest.** It builds the named component from the selected commit, performs its health check, and verifies its version. It does not claim the whole environment is on that commit when other components differ. A component deploy does not run migrations implicitly; the operator must choose the full deployment or the explicit migration operation when schema changes are involved.
- **Production still deploys automatically.** Merging the approved release PR to `production` triggers the production deployment workflow for that merge commit, as it does today. The workflow uses the same repository-owned deployment implementation as the operator-run path. Production never deploys from `develop` or a task branch. The release flow records the deployed production SHA and completes the existing smoke, health, rollback, and sign-off steps.
- **Production also has a zero-Actions fallback.** If the automatic workflow cannot start or finish because Actions is unavailable or out of budget, the operator can run the same complete production deployment from a clean checkout of the exact merge commit on `production`. The fallback does not require a new commit, a workflow dispatch, or a different deploy implementation.
- **Secrets are available outside GitHub.** The operator has a documented secure source for the Supabase owner URL, Fly deploy credentials, Vercel credentials and build-time values, and version URLs. Commands accept secrets at runtime without committing them, writing `.env` files, or printing them. GitHub Environments may remain for Actions that still need them, but they are not the only copy of deployment configuration.
- **The interface is hard to misuse.** One documented repo command family covers both environments and all components, validates required configuration before changing anything, supports a no-change/preflight mode, and prints the environment, component scope, and SHA before deployment. Exact command names are an engineering decision, but the docs and implementation use one interface rather than a list of hand-copied platform commands.
- **The production Action is a wrapper, not a second deploy system.** The automatic production workflow calls the same repository-owned deployment interface used by the operator fallback. There is one deploy implementation, not a local path and workflow path that can drift.

**Testing and branching flow:**

1. A task branch starts from `develop` and opens a PR back to `develop`, unchanged from today.
2. The implementation agent runs targeted tests locally. PR Actions run the complete path-filtered checks and task automation.
3. A human merges only a green PR. The merge updates repository history and task state but does not deploy or start a push/scheduled workflow.
4. When staging needs the change, the operator checks out the selected `develop` SHA, runs preflight, then performs a full or component staging deployment. The successful command reports and verifies the deployed SHA.
5. A release branch is cut from the exact staging-verified `develop` commit. Release-PR CI, E2E, and agent QA keep their existing order. Merging the release PR to `production` triggers the automatic production deployment through the shared deploy interface. If that Action is unavailable, the operator deploys the same production merge commit through the zero-Actions path, then continues health confirmation and sign-off.

**Failure rules:**

- A failed preflight changes nothing.
- A failed migration stops before any service deploy starts.
- If one service fails after another deployed successfully, the command names the partial state and the recovery/rollback command; it never reports the environment as successfully deployed.
- A failed version check is a failed deploy even when the hosting platform reports success.
- Losing Actions budget may block new PR checks, but it must not block deploying or rolling back a commit that has already passed the required checks.
- Losing access to GitHub entirely is out of scope; the operator still needs a local checkout of the selected commit.

**Success Criteria:**

- Merge a code PR into `develop`: PR CI and task transitions run as expected, then the push/merge to `develop` starts zero additional workflow runs.
- The workflow inventory contains no scheduled job that executes from `develop` and no documented instruction to dispatch a workflow from the `develop` ref.
- With Actions unavailable, a clean checkout of an exact commit reachable from `develop` completes a staging full deploy: migrations, web, api, game, health checks, and SHA verification.
- With Actions unavailable, a clean checkout of the production release merge commit completes the same production deployment and verification without reading secrets from GitHub Actions.
- With Actions available, merging a release PR to `production` automatically deploys and verifies that merge commit without an extra manual dispatch.
- The automatic production run and the local zero-Actions fallback exercise the same deploy entry point and produce the same migration, health-check, and version-verification behavior.
- Each of web, api, and game can be deployed and version-verified independently. The output clearly shows when the environment is intentionally on mixed component SHAs.
- A staging preflight with one required credential missing fails before migrations or platform deployment. Its output contains no credential value.
- A deliberately failing migration prevents all three service deploys. A deliberately wrong version response makes the deployment fail.
- Rollback of web, api, and game remains possible without Actions, and the documented commands are exercised in staging.
- System docs, agent instructions, workflow comments, and command help all describe the same quiet-`develop` and action-independent deployment model.

**Out of scope:** Removing PR CI; replacing GitHub Actions with another CI provider; changing task branches or the `develop` → release branch → `production` model; changing hosting providers; making staging deploy automatically by another route; changing gameplay or player-visible behavior; deploying the not-yet-hosted worker or devtools; eliminating GitHub as the source repository; and changing the additive-migration or rollback policies.
