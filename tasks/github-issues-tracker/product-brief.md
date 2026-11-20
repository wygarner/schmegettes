---
jira-type: improvement
jira-title: "Track tasks in GitHub Issues instead of Jira"
---
**Task Type:** Improvement. Internal workflow only; no player-facing change.

**Product docs:** No durable product-doc change. System docs change: [development-workflow.md](../../docs/system-docs/engineering/development-workflow.md), [branch-strategy.md](../../docs/system-docs/engineering/branch-strategy.md), [configuration-and-secrets.md](../../docs/system-docs/security/configuration-and-secrets.md), [release-strategy.md](../../docs/system-docs/operations/release-strategy.md), `AGENTS.md`, `.claude/CLAUDE.md`, and the `/product`, `/engineering` and `/implement` commands.

**Problem:** The workflow assumes a Jira project that was never configured. Every issue-type ID in `.github/jira.json` is `REPLACE_ME`, the `JIRA_*` repo secrets don't exist, and **Create Jira Ticket** has failed on every recent task-spec PR. The result is visible in the repo: `tasks/main-domain/` holds a merged `task-brief.md` but was never renamed to `main-domain-SCH-{N}`, so it has no ticket number, no implementation branch name, and no state the release tooling can read.

Decision (Wyatt Garner, 2026-11-19): **use GitHub Issues**, not Jira. It needs no external account or secrets (the workflow's own `GITHUB_TOKEN` can create and label issues), it lives next to the PRs, and the bootstrap guide expects tracker-neutral frontmatter (`task-type`, `task-title`) anyway.

**Outcomes:**
- Opening a task-spec PR creates a GitHub issue from the spec and renames the folder to `tasks/{task-name}-{N}/`, as the Jira flow was meant to do. `{N}` is the issue number.
- The state machine stays the same, expressed in GitHub instead of Jira. Engineering picks the mechanism (labels, a Project board column, open/closed), but each state must be visible on the issue:

  | Path in git | Issue state |
  |---|---|
  | `tasks/{name}/product-brief.md` | No issue yet |
  | `tasks/{name}-{N}/task-brief.md` added (spec PR merged) | In Progress |
  | that `task-brief.md` removed (implementation PR opened) | In Review |
  | that removal merged | Done (issue closed) |

- Frontmatter becomes `task-type` / `task-title`, with the same four values (`new-feature`, `enhancement`, `improvement`, `bug-fix`). Agents and docs stop saying "Jira".
- Branch names and squash titles use the issue number. Engineering picks the exact format (for example `{task-type}/{N}-{task-name}` and `[{Task Type}] #{N}: …`); `scripts/release-scope.cjs` lists a release's tasks from it.
- The Jira workflows, scripts, `.github/jira.json`, and the `JIRA_*` rows in configuration-and-secrets.md are removed, not left dormant.
- In-flight folders are migrated: every `tasks/*/product-brief.md` on `develop` switches to the new frontmatter, and `tasks/main-domain/` (spec merged, no ticket) gets an issue and its numbered folder.
- The no-direct-calls rule carries over: agents never create, edit, or transition issues themselves; GitHub Actions do it from PR events. (Agents may read issues with `gh`.)

**Flow (for the humans and agents who use it):**
1. `/product` merges `tasks/{name}/product-brief.md` with `task-type`/`task-title`. No issue.
2. `/engineering` opens the spec PR. The workflow creates issue #N, commits the rename to `tasks/{name}-{N}/` onto the PR branch, and comments the issue link on the PR.
3. The spec PR merges → the issue moves to In Progress, and its body is replaced with the merged spec.
4. The implementation PR deletes the folder → In Review. It merges → the issue closes as Done.
5. Edge cases: a spec PR closed without merging leaves the issue open with a "not merged" note, and reopening the PR reuses it. A re-run of the workflow on the same PR never creates a second issue. A spec longer than GitHub's issue-body limit (65,536 characters) is truncated with a link to the file.

**Success Criteria:**
- A test task-spec PR creates exactly one issue, renames the folder with that issue's number, and moves through In Progress → In Review → Done with no manual step.
- `grep -ri jira` over the repo (outside git history and dated release notes) returns nothing.
- The **Create** and **transitions** workflows' existing script tests are replaced by equivalent tests for the GitHub version, run in CI.
- `release-scope.cjs` lists the right tasks for a release built from the new squash titles; its tests cover the new format.
- No new secret is added.

**Out of scope:** Migrating any historical Jira data (none exists), GitHub Projects dashboards beyond what the state machine needs, auto-assigning issues, and moving product briefs themselves into issues (they stay as files).
