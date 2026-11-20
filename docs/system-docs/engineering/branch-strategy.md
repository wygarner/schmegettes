# Branch Strategy

**Source of truth:** `.github/workflows/`

## Branch model

```text
production
  └── develop
      └── {task-type}/{branch-name}
```

| Branch | Cut from | PR into | Merge method |
|---|---|---|---|
| `{task-type}/{task-name}-product-brief` | `develop` | `develop` | Squash, delete branch |
| `{task-type}/{task-name}` (task spec; folder gets the key when the PR opens) | `develop` | `develop` | Squash, delete branch |
| `{task-type}/GH-{N}-{task-name}` (implementation) | `develop` | `develop` | Squash, delete branch |
| `releases/X.Y.Z` | `develop` | `production` | **Merge commit, never squash** |
| `hotfix/X.Y.Z-description` | `production` | `production`, then backport to `develop` | **Merge commit, never squash** |

No nested paths after the task-type prefix.

## Task types

| Branch prefix | `task-type` frontmatter | Use |
|---|---|---|
| `new-feature/` | `new-feature` | Net-new capability |
| `enhancement/` | `enhancement` | Addition to an existing feature |
| `technical-improvement/` | `improvement` | Refactor, tech debt, performance, DX |
| `bug-fix/` | `bug-fix` | Defect correction |

`technical-improvement/` is the one mismatch: its frontmatter value is `improvement`. Writing `technical-improvement` in frontmatter fails issue creation with `unknown task-type`.

## Task branches and `develop`

Every task branch starts from and targets `develop`:

```bash
git fetch origin
git checkout --no-track -b {task-type}/{task-name} origin/develop
```

| | PR into `develop` | Merge into `develop` |
|---|---|---|
| CI | Full, path-filtered (`ci.yml`). Must be green before merging | None (no push trigger) |
| Deploys | None | Staging (`deploy-staging.yml`): migrations, then api, game and web. Skipped when the merge changes only `docs/`, `tasks/`, `releases/` or `.md` files |
| Task issue automation | Issue creation and transitions | — |

Rules:

- **Green CI before merging.** CI runs on every PR into `develop`, and every merge that changes code deploys staging, so a red PR never merges.
- Run targeted local tests before opening the PR anyway: they are faster than CI and catch most failures.
- Merge `origin/develop` into the task branch before opening the PR. GitHub returns no file list for a PR opened with conflicts, so the issue transitions would never fire.
- Never push straight to `develop`: everything goes through a PR.
- Never write `[skip ci]` in a commit message. A squash merge copies every commit message into one, and GitHub then starts no workflow for that push, including the staging deploy.

### Why squash into `develop`, and merge commits for release and hotfix PRs

A squash keeps each task as one commit on `develop`, titled `[{Task Type}] GH-{N}: … (#PR)`, which `scripts/release-scope.cjs` reads. Release and hotfix PRs merge as merge commits so `production` keeps every task commit as it was on `develop`.

### History before 2026-11-18

Until 2026-11-18 tasks went through a `daily/YYYY-MM-DD` branch that merged into `develop` once a day. Those merges are still on `develop` as `Merge pull request #N from …/daily/…` commits, and three were squashed (`[Daily] … (#N)`). `scripts/release-scope.cjs` still expands the squashed ones.

## PR titles

```text
[{Task Type}] GH-{N}: {brief description}
[Engineering] GH-{N}: task spec
[Product] {task-name}: product brief
[Release] 0.1.0
```

## Verification

After pushing any branch: `git ls-remote --heads origin {branch}` prints one line. Empty means the push failed.

## Worktrees

```bash
git worktree add ../schmegettes-GH-{N} {task-type}/GH-{N}-{task-name}
git worktree remove ../schmegettes-GH-{N} && git worktree prune
```
