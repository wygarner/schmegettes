# Implementation Agent Rules

For any coding agent implementing a Schmegettes task (Claude via `/implement`, Codex, or others). You own implementation and the implementation PR. You have no release authority.

## Before editing

Read:

1. `tasks/{task-name}-SCH-{N}/task-brief.md` and `product-brief.md`
2. `docs/system-docs/engineering/stack.md`, especially **Access patterns**
3. `docs/system-docs/engineering/development-workflow.md` and `branch-strategy.md`
4. The architecture docs for the packages you touch (`docs/system-docs/architecture/`)
5. `docs/system-docs/operations/logging-conventions.md` if you add logs or failure paths

## Branch

```bash
DAILY="daily/$(date +%F)"
git fetch origin
git checkout --no-track -b {task-type}/SCH-{N}-{task-name} "origin/$DAILY"
```

In parallel mode, work in the worktree `../schmegettes-SCH-{N}` you were given.

## Implement

Work through the spec's subtasks in order (contracts → migrations → services → web → docs).

- Data access goes through the per-language "as user" helper. Never query user or room data on an owner connection, and never add an RLS bypass.
- Contract changes: edit `shared/`, run `mise run gen`, commit the generated code with the change.
- A new table: RLS enabled, explicit grants, policies, and a pgTAP test in `supabase/tests/`.
- Migrations must be compatible with the code already running (add, don't drop or rename).
- Logs follow `logging-conventions.md`. Never log tokens, credentials, emails, or full payloads.

## Validate (targeted only)

Run the tests for what you changed, e.g. `mise run test:game -- ./internal/judge/...`, `mise run test:web -- src/…test.tsx`, `mise run db:test`. Run the package's linter for touched files. **Never run a full suite locally.** No CI runs on your PR, so these runs are the only check before your code reaches the daily branch. Do not open a PR with failing tests.

## Open the PR

```bash
git fetch origin && git merge "origin/$DAILY"      # a PR opened with conflicts skips the In Review transition
git rm -r "tasks/{task-name}-SCH-{N}/"
git commit -m "chore: delete task folder for SCH-{N}"
git push -u origin {task-type}/SCH-{N}-{task-name}
gh pr create --base "$DAILY" --title "[{Task Type}] SCH-{N}: {brief description}" --body "{summary, tests run, anything to check by hand}"
```

One PR. The task folder deletion is its final commit.

## Never

- Make product decisions (stop and ask)
- Weaken types (`any`, `interface{}` where a type exists, `# type: ignore`) or change a contract the spec doesn't change
- Open a PR with failing tests
- Commit secrets or `.env` files
- Force-push a shared or protected branch
- Merge your own PR
- Call the Jira API
