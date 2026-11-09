# Branch Strategy

**Source of truth:** `.github/workflows/`, `scripts/daily-merge-guard.cjs`

## Branch model

```text
production
  └── develop
      └── daily/YYYY-MM-DD
          └── {task-type}/{branch-name}
```

| Branch | Cut from | PR into | Merge method |
|---|---|---|---|
| `{task-type}/{task-name}-product-brief` | daily | daily | Squash, delete branch |
| `{task-type}/{task-name}` (task spec; folder gets the key when the PR opens) | daily | daily | Squash, delete branch |
| `{task-type}/SCH-{N}-{task-name}` (implementation) | daily | daily | Squash, delete branch |
| `daily/YYYY-MM-DD` | `develop` | `develop` | **Merge commit, never squash** |
| `releases/X.Y.Z` | `develop` | `production` | **Merge commit, never squash** |
| `hotfix/X.Y.Z-description` | `production` | `production`, then backport to `develop` | **Merge commit, never squash** |

No nested paths after the task-type prefix.

## Task types

| Branch prefix | `jira-type` frontmatter | Use |
|---|---|---|
| `new-feature/` | `new-feature` | Net-new capability |
| `enhancement/` | `enhancement` | Addition to an existing feature |
| `technical-improvement/` | `improvement` | Refactor, tech debt, performance, DX |
| `bug-fix/` | `bug-fix` | Defect correction |

`technical-improvement/` is the one mismatch: its frontmatter value is `improvement`. Writing `technical-improvement` in frontmatter fails ticket creation with `Unknown jira-type`.

## Daily branch

A daily branch is cut from `develop` each working day (local date). The first task of the day creates it:

```bash
DAILY="daily/$(date +%F)"
git fetch origin
git ls-remote --exit-code --heads origin "$DAILY" >/dev/null || git push origin "origin/develop:refs/heads/$DAILY"
git fetch origin
git checkout --no-track -b {task-type}/{task-name} "origin/$DAILY"
```

| | PR into `daily/*` | `daily/*` → `develop` |
|---|---|---|
| CI | **None.** No tests, builds, lint, or secret scan. | Full, path-filtered |
| Jira automation | Ticket creation and transitions | None (skipped) |

Rules:

- A task merged into the daily branch is unverified until the daily PR is green, so targeted local tests before every task PR are required.
- Never commit directly to a daily branch or open a task PR against `develop`.
- Yesterday's daily PR merges before today's branch is cut. Retarget task PRs still open on an old daily branch (`gh pr edit {N} --base daily/YYYY-MM-DD`) before deleting it; GitHub closes a PR whose base branch is deleted.

### Why merge commits for daily, release, and hotfix PRs

A squash copies every commit message into one. If any contains `[skip ci]`, GitHub starts no workflow for that push, including the production deploy. A merge commit also keeps each task as one commit on `develop`, which the release scope script reads.

### When a daily PR was squashed

`daily-merge-guard.yml` fails on the push. Check a commit by hand with `node scripts/daily-merge-guard.cjs {sha}`.

1. **Leave it (preferred).** No code or ticket is lost: `scripts/release-scope.cjs` reads tickets from the squash commit's body and the PR description.
2. **Revert and merge again**, only while the squash is still the tip of `develop` and the daily branch still exists: revert through a PR into `develop`, then reopen the daily PR and merge it with `gh pr merge --merge`.

A task branch cut from the squashed daily is moved with `git rebase --onto origin/daily/{today} origin/daily/{squashed-day} {task-branch}`, not a plain rebase.

## PR titles

```text
[{Task Type}] SCH-{N}: {brief description}
[Engineering] SCH-{N}: task spec
[Product] {task-name}: product brief
[Daily] 2026-10-27
[Release] 0.1.0
```

## Verification

After pushing any branch: `git ls-remote --heads origin {branch}` prints one line. Empty means the push failed.

## Worktrees

```bash
git worktree add ../schmegettes-SCH-{N} {task-type}/SCH-{N}-{task-name}
git worktree remove ../schmegettes-SCH-{N} && git worktree prune
```
