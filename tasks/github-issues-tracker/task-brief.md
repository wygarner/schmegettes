---
jira-type: improvement
jira-title: "Track tasks in GitHub Issues instead of Jira"
---
# Task spec: github-issues-tracker

Product brief: [product-brief.md](./product-brief.md). Replace the Jira automation with GitHub Issues, driven by the same PR events and the same task-folder state machine.

This task bootstraps the tracker, so it runs **without a ticket**. Its spec PR still triggers the old `Create Jira Ticket` workflow, which fails as it has on every recent spec PR; ignore that failure. The folder stays `tasks/github-issues-tracker/`, and the implementation branch is `technical-improvement/github-issues-tracker-impl` (see "Branch" below).

## Approach

**The key becomes `GH-{N}`, where `{N}` is the issue number.** GitHub autolinks `GH-123` to issue #123 in PR titles, bodies, and commit messages, and the token doesn't collide with the `(#PR)` suffix GitHub adds to squash titles. Every existing pattern keeps its shape, with `GH` in place of `SCH`:

| | Jira (old) | GitHub Issues (new) |
|---|---|---|
| Task folder after spec PR opens | `tasks/{name}-SCH-{N}/` | `tasks/{name}-GH-{N}/` |
| Metadata file | `.jira-meta.yml` | `.task-meta.yml` |
| Implementation branch | `{type}/SCH-{N}-{name}` | `{type}/GH-{N}-{name}` |
| Squash title | `[{Task Type}] SCH-{N}: …` | `[{Task Type}] GH-{N}: …` |
| Spec PR title | `[Engineering] SCH-{N}: task spec` | `[Engineering] GH-{N}: task spec` |
| Frontmatter | `jira-type`, `jira-title` | `task-type`, `task-title` (same four values) |

No commit on `develop` or `production` contains an `SCH-{N}` key (checked 2026-11-20), so nothing historical needs translating.

**Issue states are labels, and Done means closed:**

| Event (unchanged) | Issue |
|---|---|
| Spec PR opened | Created, labelled `task`, `type:{task-type}`, `status:planned`; body = spec |
| Spec PR merged | `status:planned` → `status:in-progress`; body replaced with the merged spec |
| Spec PR closed unmerged | Comment "Spec PR #{pr} closed without merging."; issue stays open and `status:planned` |
| Implementation PR opened (removes `task-brief.md`) | `status:in-progress` → `status:in-review` |
| Implementation PR merged | Status labels removed; issue closed as completed, with a comment linking the PR |

GitHub's own "Closes #N" keywords only fire on merges into the default branch (`main`), not `develop`, so the workflow closes the issue itself.

## Subtasks

### 1. Shared script library (`.github/scripts/lib/`)

- New `task_brief.py`: move `parse_frontmatter` and `extract_brief_body` here from `markdown_adf.py`, unchanged in behavior. Add `TASK_TYPES = ("new-feature", "enhancement", "improvement", "bug-fix")`, `KEYED_DIR = re.compile(r"-GH-\d+$")`, and `TASK_NAME_PATTERN = re.compile(r"^[a-z0-9-]+$")`.
- `read_brief(path) -> (task_type, task_title, body)`: requires `task-type` and `task-title`. A brief that still has `jira-type`/`jira-title` fails with `"{path} uses jira-type/jira-title; rename them to task-type/task-title"`. An unknown type fails with the four allowed values.
- `issue_body(task_name, body, ref)`: prepends `<!-- task-folder: {task_name} -->` (the idempotency marker) and a link to the file on `ref`. If the result exceeds 65,000 characters, it is cut at the last line break before the limit and ends with "… truncated. Full spec: {link}".
- Delete `jira_client.py`, `jira_config.py`, and `markdown_adf.py`.

### 2. Issue creation workflow

Replace `.github/workflows/create-jira-ticket.yml` with `create-task-issue.yml`. Keep its trigger (`pull_request: opened` into `develop` touching `tasks/**/task-brief.md`, plus `workflow_dispatch` with `files`), its two-job split, and the rule that scripts come from the **base** branch while the PR head is checked out only as data.

- **Job `create-issue`** (`permissions: contents: read, issues: write, pull-requests: read`): runs `.github/scripts/create-task-issue.py` (replaces `create-jira-task-docs.py`). Same validation as today: path shape, `TASK_NAME_PATTERN`, symlink refusal, skip folders that already have a key or `.task-meta.yml`, and only the first brief per PR. Then:
  1. Ensure labels exist (`task`, `type:new-feature`, `type:enhancement`, `type:improvement`, `type:bug-fix`, `status:planned`, `status:in-progress`, `status:in-review`), creating any that are missing. This is idempotent.
  2. **Idempotency:** list issues labelled `task` (state all) and look for the marker `<!-- task-folder: {name} -->`. If found, reuse that issue number instead of creating another.
  3. Otherwise create the issue: title = `task-title`, body = `issue_body(...)`, labels as in the table.
  4. Output `tickets` as today, with `dir`, `key` (`GH-{N}`), and `meta`. `.task-meta.yml` holds `issue: {N}`, `key: GH-{N}`, `title`, `task-type`, `created`.
  5. Comment on the spec PR: "Tracking issue: GH-{N}".
  - Call the REST API with `urllib` and `GITHUB_TOKEN`, as `jira_client.py` did, so the script stays dependency-free and testable without `gh`.
- **Job `commit-key`** (`permissions: contents: write`): unchanged apart from names. It validates `dir` and `key` (`^GH-[0-9]+$`), writes `.task-meta.yml`, runs `git mv tasks/{dir} tasks/{dir}-{key}`, commits `chore: assign task issue`, and pushes. Keep the comment about not using `[skip ci]`.

### 3. Transitions workflow

Replace `jira-transitions.yml` with `task-issue-transitions.yml`. Same trigger (`pull_request: opened, closed`), same file-status detection (`added|renamed` keyed `task-brief.md` on merge → in progress; `removed` on open → in review; `removed` on merge → done), with the key pattern `GH-[0-9]+`. Add the "spec PR closed unmerged" case: `added|renamed` keyed `task-brief.md`, action `closed`, not merged → comment only.

- `permissions: contents: read, issues: write, pull-requests: read`. Scripts from the base SHA; the merged spec is read from `merge_commit_sha` as data, as today.
- `.github/scripts/transition-task-issue.py {N} {step}` (replaces `transition-jira.py` and `update-jira-task-spec.py`): swaps status labels, replaces the body with `issue_body(...)` of the merged spec on `inProgress`, and closes with `state_reason: completed` plus a comment on `done`. Each step is safe to run twice: labels already in place, or an issue already closed, mean no change and exit 0.
- A step for an issue that doesn't exist fails the job with a clear error. It never creates one.

### 4. Release scope (`scripts/release-scope.cjs`)

- Replace the `.github/jira.json` read with a constant `KEY_PREFIX = "GH"`. `TASK_KEY_PREFIX` overrides it for tests, replacing `JIRA_PROJECT_KEY`.
- Update the header comment ("Lists the tasks…") and the `KAN-N` examples to `GH-N`. The classification logic is unchanged.
- `release-scope.test.cjs`: switch fixtures to `GH-{N}` and add a case for `[Improvement] GH-12: … (#230)` that proves `#230` isn't read as a key.

### 5. Remove Jira

- Delete `.github/jira.json`, both Jira workflows, `create-jira-task-docs.py`, `transition-jira.py`, `update-jira-task-spec.py`, and `tests/test_jira_config.py`.
- No secrets to add. Wyatt can delete any `JIRA_*` secrets if they exist (none do today).

### 6. Migrate in-flight task folders

In the implementation PR, before the final commit:

- Rename `jira-type`/`jira-title` to `task-type`/`task-title` in every `tasks/*/product-brief.md` and `tasks/*/task-brief.md` on `develop` at the time (on 2026-11-20 that's `agent-qa`, `backups-and-restore`, `clue-difficulty`, `data-retention`, `main-domain`, `observability`, `release-test-layer`, `security-audit-and-staff-access`, `service-notices`, `stats-and-leaderboard`; re-list after merging `origin/develop`).
- Folders with a **merged `task-brief.md` and no key** (`main-domain`, `clue-difficulty`, and any others found) get their issues **after** this PR merges, since the new workflow must be on `develop` first. Record the follow-up in the PR description: for each folder, run `gh workflow run create-task-issue.yml --ref develop -f files=tasks/{name}/task-brief.md`. The `commit-key` job needs a branch to push to, so for a dispatch on `develop` it opens a PR named `chore/assign-GH-{N}` with the rename instead of pushing to `develop` directly. Then set `status:in-progress` on those issues, since their specs are already merged (a `transition` input on the dispatch, or by hand: document which).

### 7. Docs and agent instructions

Replace Jira with GitHub Issues and `SCH-{N}` with `GH-{N}` everywhere:

- `docs/system-docs/engineering/development-workflow.md`: lifecycle diagram, step table, the state-machine table, Step 2 (creation, `.task-meta.yml`, rename), the "Jira setup" section (delete; replace with a short "Issue labels" note), and the description limit (65,000 characters, truncated with a link, instead of failing at 30,000).
- `docs/system-docs/engineering/branch-strategy.md`: branch and title patterns; the frontmatter table (`task-type`; `technical-improvement/` still maps to `improvement`); the "Jira automation" row.
- `docs/system-docs/operations/release-strategy.md`, `docs/system-docs/security/configuration-and-secrets.md` (remove the `JIRA_*` row and the `JIRA_API_TOKEN` rotation row), `docs/system-docs/security/security-model.md`.
- `docs/product-docs/features/README.md` ("No task frontmatter here"), `tasks/README.md`.
- `AGENTS.md` and `.claude/CLAUDE.md`: "Never call the Jira API. GitHub Actions own every Jira write." becomes "Never create, edit, label, or close task issues. GitHub Actions own every issue write. Reading issues with `gh` is fine."
- `.claude/commands/product.md`, `engineering.md`, `implement.md`: frontmatter, key, branch and title patterns, the "check the Jira transition" steps (now `gh run list --workflow "Task Issue Transitions" --limit 1` and `gh issue view {N}`), and the dispatch fallback command.

## Key files

`.github/workflows/{create-task-issue,task-issue-transitions}.yml` (new), `.github/scripts/{create-task-issue,transition-task-issue}.py` (new), `.github/scripts/lib/task_brief.py` (new), `.github/scripts/tests/` (new tests), `scripts/release-scope.cjs` and its test, the docs and commands above. Deleted: everything named `*jira*`.

## Contracts preserved

No change to `shared/`, the database, `api`, `game`, `web`, or any deploy workflow. The PR-event contract is preserved: the same file statuses drive the same state transitions. Only the key format (`GH-{N}`), the metadata file name, and the frontmatter keys change.

## Success criteria

From the product brief, plus:

- A test spec PR (a throwaway `tasks/tracker-smoke/task-brief.md`) gets exactly one issue labelled `task`, `type:improvement`, `status:planned`. Its folder is renamed to `tracker-smoke-GH-{N}` with `.task-meta.yml`, and the PR gets the "Tracking issue" comment. Re-running the workflow on that PR creates no second issue.
- Merging it moves the issue to `status:in-progress` and replaces the body. An implementation PR that deletes the folder moves it to `status:in-review`, and merging that PR closes the issue as completed. The smoke folder and issue are cleaned up afterwards (the issue stays closed).
- `grep -rIil jira . --exclude-dir={.git,node_modules,releases}` returns nothing.
- `main-domain` and `clue-difficulty` end with `GH-{N}` folders and `status:in-progress` issues.
- `node scripts/release-scope.cjs origin/production origin/develop` runs without `.github/jira.json`.

## Test plan

Run `mise run test:scripts`. It runs both the Node and the Python tests, and CI runs the same job because the PR touches `.github/` and `scripts/`.

- `.github/scripts/tests/test_task_brief.py`: frontmatter parsing; `jira-*` keys rejected with the rename message; unknown type rejected; `issue_body` adds the marker and link, and truncates at a line break over 65,000 characters.
- `.github/scripts/tests/test_create_task_issue.py`: path validation (bad shape, bad name, symlink, already keyed, `.task-meta.yml` present); only the first brief is processed; an existing issue with the marker is reused (fake API client); the `tickets` output shape.
- `.github/scripts/tests/test_transition_task_issue.py`: each step's label changes against a fake client; running a step twice is a no-op; `done` closes with `completed`; a missing issue raises.
- `scripts/release-scope.test.cjs`: `GH-{N}` fixtures, and `(#PR)` not read as a key.
- Workflows: `actionlint` on the two new workflows if it's available in the scripts job; otherwise the smoke PR above is the test.

## Database migration plan

None.

## Logging requirements

Workflow logs print the task folder, issue number, and transition. They never print the token or the issue body.

## Docs to update

Listed in subtask 7.

## Branch

`technical-improvement/github-issues-tracker-impl`, from and into `develop`. There is no ticket: this task creates the tracker. The PR is titled `[Improvement] github-issues-tracker: track tasks in GitHub Issues`, and its final commit deletes `tasks/github-issues-tracker/`.
