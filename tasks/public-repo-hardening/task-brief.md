---
task-type: improvement
task-title: "Make the repository safe to publish"
---
# Task Brief

Implement [product-brief.md](./product-brief.md). This task makes the repository safe to switch from private to public. It closes the remaining workflow gaps, adds a static policy test that keeps them closed, produces the evidence for the pre-publish checklist, and adds the open-source files. Changing visibility, applying GitHub settings, and rotating credentials are human actions. The implementation agent prepares them but doesn't perform them.

**Sequencing exception.** This task must merge before the repository is public, but task-issue creation only works once Actions runs again, which needs the repo to be public. So this task runs without a `GH-{N}` key. It's implemented on `technical-improvement/public-repo-hardening-impl` and merged by Wyatt without CI (already approved for this period). The task folder is deleted in the implementation PR's final commit, as usual.

## Current state (audited on `develop` at 853675b)

- No workflow uses `pull_request_target` or `workflow_run`. Every workflow declares `permissions`.
- `create-task-issue.yml` and `task-issue-transitions.yml` already run scripts from the base branch and check out PR content only as data.
- Every action except `jdx/mise-action@v5` (used in `ci.yml`, `deploy.yml`, `e2e.yml`, `load-clues.yml`, `rate-clues.yml`) is pinned to a full SHA.
- `run:` blocks interpolate only `github.event_name`, `github.repository`, PR numbers, and commit SHAs. User-controlled strings (titles, branch names, `inputs.*`) already go through `env:`.
- No job distinguishes a fork PR. On a fork PR:
  - `ci.yml`'s `evals` job runs with an empty `ANTHROPIC_API_KEY` (non-blocking, but noisy);
  - `create-task-issue.yml` fails on the read-only token, and `commit-key` would try to check out a head ref that doesn't exist in this repo;
  - `task-issue-transitions.yml` fails on the read-only token.
- `ci.yml`'s gitleaks job scans only the PR commit range. No full-history scan has been recorded.
- There's no `LICENSE`, `SECURITY.md`, or `CONTRIBUTING.md`. About 86 remote branches exist, many already merged.

## Subtasks

### 1. Guard workflows against fork PRs

Define "trusted PR" as `github.event.pull_request.head.repo.full_name == github.repository`.

- `create-task-issue.yml`: both jobs run only for a trusted PR or `workflow_dispatch`. A fork PR that adds a task brief skips the jobs cleanly; it doesn't fail.
- `task-issue-transitions.yml`: the `pull_request` path runs only for trusted PRs.
- `ci.yml` `evals`: also require a trusted PR (or a non-PR event). Every other CI job runs unchanged for forks with no secrets.
- `deploy-*.yml`, `e2e.yml`, `load-clues.yml`, `rate-clues.yml`: no PR trigger exists. Leave the triggers alone.

**Key files:** `.github/workflows/create-task-issue.yml`, `.github/workflows/task-issue-transitions.yml`, `.github/workflows/ci.yml`

### 2. Pin the remaining action

Replace every `jdx/mise-action@v5` with the full commit SHA of the v5 release the repo resolves today, plus a `# v5.x.y` comment. `.github/dependabot.yml` already covers the `github-actions` ecosystem, so Dependabot keeps the SHA pins up to date.

**Key files:** the five workflows above

### 3. Add a static workflow policy test

Add `scripts/workflow-policy.test.mjs`, picked up by the existing `test:scripts` glob. Parse every `.github/workflows/*.yml` with the YAML parser already in the lockfile; if none exists, use a minimal line-based parser — don't add a dependency for this. The test fails when:

1. any workflow has an `on.pull_request_target` or `on.workflow_run` trigger;
2. a workflow has no top-level `permissions` and some job also lacks `permissions`;
3. a `uses:` that isn't local (`./`) isn't pinned to a 40-character hex SHA;
4. a `run:` block contains `${{` followed by `github.event.pull_request.title`, `.body`, `.head.ref`, `github.head_ref`, `github.event.issue`, `github.event.comment`, or `inputs.` (these values must pass through `env:`);
5. a job that holds `issues: write`, `pull-requests: write`, or `contents: write`, or that references `secrets.*` other than `GITHUB_TOKEN`, can run on a `pull_request` event without the trusted-PR guard from subtask 1;
6. any job uses `runs-on` with `self-hosted`.

Each failure names the file, job, and rule. Include fixture-based negative tests that prove each rule fires.

**Key files:** `scripts/workflow-policy.test.mjs` (new), `scripts/fixtures/workflow-policy/` (new, if fixtures are files)

### 4. Full-history secret scan (evidence, not code)

Add `scripts/history-scan.sh`, a thin wrapper that runs the pinned gitleaks 8.30.1 (the same version and checksum as `ci.yml`) over `git log --all` with `.gitleaks.toml` and `--redact`. It writes a redacted report to a path the operator chooses, outside the repo. Document it in `operator-scripts.md`.

The implementation agent runs it locally and records only counts and rule IDs on the PR, never matched values. Every finding is classified as false positive (add a narrowly scoped allowlist entry, following the rules in `.gitleaks.toml`) or real (listed for Wyatt to rotate). The agent never rewrites history.

Also report something gitleaks doesn't catch: the set of distinct commit author/committer emails. Report it as a count plus the domains only, so Wyatt can decide whether real addresses in history are acceptable once public.

**Key files:** `scripts/history-scan.sh` (new), `.gitleaks.toml` (only if a provable false positive needs an allowlist entry)

### 5. Content review (evidence, not code)

Review `docs/`, `tasks/`, `releases/`, `.claude/`, `AGENTS.md`, `evals/`, and `supabase/seed.sql` for:

- personal data: real emails, phone numbers, player names, and IPs;
- internal-only operational detail: hostnames that aren't already public, account IDs, and dashboards with tokens in the URL;
- third-party content the project may not redistribute, such as clue datasets or copyrighted text committed as fixtures.

Remove or redact only clear-cut cases in this PR. List every judgment call as a checkbox in the PR description for Wyatt. Leave issue and PR history on GitHub unchanged and list anything concerning there for Wyatt.

### 6. Open-source files

- `LICENSE`: the full GPL-3.0 text, verbatim from gnu.org.
- `SECURITY.md`: report vulnerabilities privately via GitHub's "Report a vulnerability" (private advisories), never via public issues. Give a response expectation in plain terms and the supported version (the current `production` release).
- `CONTRIBUTING.md`, short:
  - PRs target `develop`;
  - task issues are created and moved by automation only;
  - fork PRs need maintainer approval before CI runs;
  - run targeted tests locally (`mise run test:*`);
  - never commit secrets.
- `README.md`: add a license line and link the two new files.

### 7. Settings checklist and docs

Add a "Public repository" section to `docs/system-docs/security/security-model.md` that states the trusted-PR model and the policy-test rules. Add a pre-publish runbook with exact `gh api` commands Wyatt can run (the agent doesn't run any mutating `gh api` calls):

- require approval for all outside collaborators' fork PR workflows;
- protect `develop` and `production` (PRs required, no force push, no deletion; required status checks left configurable);
- give the `production` environment required reviewer Wyatt, with deployment branches limited to `production`, and the `staging` environment deployment branches limited to `develop`;
- enable private vulnerability reporting, secret scanning, push protection, and Dependabot alerts after the visibility switch (some are only free once public);
- delete merged remote branches: list them with `git branch -r --merged origin/develop`, and Wyatt confirms the list before anything is deleted;
- the visibility switch itself, as the last step.

Also update `configuration-and-secrets.md` (fork PRs receive no secrets; rotation follows any real scan finding) and `development-workflow.md` (fork-PR behaviour and the keyless exception used by this task).

**Key files:** `docs/system-docs/security/security-model.md`, `docs/system-docs/security/configuration-and-secrets.md`, `docs/system-docs/engineering/development-workflow.md`, `docs/system-docs/operations/operator-scripts.md`

## Contracts preserved

No change to `shared/openapi.yaml`, `shared/schemas/protocol/`, `shared/schemas/jobs/`, generated code, the database, or any player-visible behaviour. Workflow triggers are unchanged; only job-level `if:` guards and action pins change.

## Database migration plan

None.

## Logging requirements

No runtime service logging changes. `history-scan.sh` output must stay redacted: it prints no matched secret value and no full email addresses. The PR records counts, rule IDs, file paths, and email domains only.

## Success criteria

1. `mise run test:scripts` passes, including the new policy test, and each policy rule has a negative fixture that fails as expected.
2. No workflow has a `pull_request_target` or `workflow_run` trigger, a non-SHA-pinned action, or a self-hosted runner, and the test enforces all three.
3. On a fork PR, CI runs without secrets, the evals job is skipped, and both task-issue workflows skip with no error and no issue writes. This is verified by Wyatt after publishing with a test fork PR.
4. On a same-repo PR, task-issue creation and transitions behave exactly as before.
5. The full-history scan has been run, and the PR lists the result as counts and rule IDs, with every finding classified. No real finding is left unrotated before visibility changes.
6. The content review is complete, with clear-cut removals done and judgment calls listed for Wyatt.
7. `LICENSE` (GPL-3.0), `SECURITY.md`, and `CONTRIBUTING.md` exist, and `README.md` links them.
8. The pre-publish runbook lists every settings change as an exact command, with visibility last.

## Test plan

Implementation agent:

```bash
mise run test:scripts
cd .github/scripts && python3 -m unittest discover -s tests -t .   # only if the Python task scripts change
git diff --check
scripts/history-scan.sh <report path outside the repo>               # evidence only; never commit the report
```

Use `actionlint` on the changed workflows if it's available through mise; don't add it as a new required tool. Don't run full package suites.

Wyatt, after the merge: apply the runbook settings, flip visibility, then open one test PR from a fork and one from a same-repo branch, and record the results in the PR.

## Docs to update

- `docs/system-docs/security/security-model.md`
- `docs/system-docs/security/configuration-and-secrets.md`
- `docs/system-docs/engineering/development-workflow.md`
- `docs/system-docs/operations/operator-scripts.md`
- `README.md`
- new: `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`
