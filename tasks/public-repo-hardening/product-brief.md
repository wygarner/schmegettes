---
task-type: improvement
task-title: "Make the repository safe to publish"
---
**Task Type:** Improvement. This changes repository security and governance, not player-facing behavior.

**Product docs:** No durable player-product documentation changes. Update `docs/system-docs/security/security-model.md`, `docs/system-docs/security/configuration-and-secrets.md`, `docs/system-docs/engineering/development-workflow.md`, and add the top-level files listed below.

**Problem:** The repository is about to become public so that GitHub-hosted Actions runners stop consuming budget. Today it's private, and its workflows, history, and documentation assume only trusted collaborators can see it or open pull requests. Publishing exposes the full git history, every issue and PR, and the `docs/`, `tasks/`, and `releases/` content. It also lets anyone fork the repo and open a PR that runs workflows. Nothing has yet confirmed that this is safe.

**Gate:** This task must merge, and its pre-publish checklist must be signed off by Wyatt, before the repository's visibility changes. Changing visibility is a human action and isn't part of the implementation.

**Outcomes:**

- **No secret is published.** The full git history (all branches and tags that will be pushed) is scanned for credentials, tokens, private URLs, and personal data. Any finding is rotated at its provider. History is rewritten only if Wyatt chooses that over rotation.
- **Fork PRs cannot reach secrets or write state.** No workflow uses `pull_request_target` or `workflow_run` to check out or execute PR-supplied code. Fork PRs run CI with a read-only token and no secrets. Workflows that need write access or secrets (task-issue automation, deploys) either skip cleanly for fork PRs or run only on trusted events. Fork PRs also require maintainer approval before workflows run.
- **Deploys are maintainer-only.** Staging and production deploy workflows run only on pushes to `develop`/`production` by maintainers. The `production` environment requires a protected branch and Wyatt's approval. No workflow takes a deploy target or ref from untrusted input.
- **Least-privilege tokens.** Every workflow declares explicit `permissions`. Third-party actions are pinned to full commit SHAs. Only GitHub-hosted runners are used, never self-hosted runners.
- **Branch protection.** `develop` and `production` block force pushes and deletion, and require PRs. Required status checks stay configurable, so CI outages don't lock merges.
- **Published content is intentional.** `docs/`, `tasks/`, `releases/`, `.claude/`, and issue/PR history are reviewed for personal data, internal-only operational detail, and third-party content the project can't redistribute. Anything that shouldn't be public is removed or moved before publishing.
- **Open-source basics exist.** `LICENSE` (GPL-3.0, consistent with the accepted espeak-ng dependency), `SECURITY.md` (a private vulnerability-reporting route, with GitHub private advisories enabled), and a short `CONTRIBUTING.md` that explains PRs target `develop` and that task issues are automation-owned.
- **Repo security features on.** Secret scanning with push protection, Dependabot alerts, and code scanning are enabled once they're free on the public repo.

**Pre-publish checklist (human sign-off):** the history scan is clean or every finding is rotated; the workflow audit has passed; branch protection and environment rules are set; the content review is done; the license and security policy are merged; and fork-PR approval is required.

**Success Criteria:**

- A test fork PR runs CI without secrets, creates or modifies no issues, and starts no deploy.
- A static workflow-policy check fails if `pull_request_target` checks out PR code, a workflow omits `permissions`, or an action isn't SHA-pinned.
- The history scan report is attached to the PR, with no unrotated finding.
- After publishing, maintainer PRs into `develop` run CI and task-issue automation as before, now without budget limits.

**Out of scope:** Changing deploy mechanics (see `action-budget-independent-delivery`); changing the task or branch model; accepting outside contributions beyond what `CONTRIBUTING.md` describes; marketing or announcing the release; and changing any player-visible behavior.
