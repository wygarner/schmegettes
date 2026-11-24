---
task-type: improvement
task-title: "Remove the marketing and revenue agents"
---
# Task spec: remove the marketing and revenue agents

Product brief: [product-brief.md](product-brief.md).

## Subtasks

### 1. Delete the two agent commands

- Delete `.claude/commands/marketing.md`.
- Delete `.claude/commands/revenue.md`.

Nothing else in the repo loads, links to, or generates these files. Neither agent writes output into the repo.

### 2. Keep the trademark rule

`marketing.md` holds the fullest wording of the trademark rule, and `revenue.md` points to it. [product-overview.md](../../docs/product-docs/architecture/product-overview.md) "Principles" → **Our own names** already states the rule for "the product, code, or docs". Widen that sentence to cover what the marketing agent added, so the rule survives the deletion:

> Schmegettes never names or imitates the TV quiz show it resembles (its name, logo, music, or catchphrases), in the product, code, or docs, or anywhere it is promoted (store listings, ads, domains). Describe the format generically ("game-show trivia").

Change only that one sentence. Make no other product-doc edits.

### 3. README

[README.md](../../README.md) line 23: change the agent list to `/product`, `/engineering`, `/implement`, `/designer`. Keep the rest of the line.

## Key files

| Subtask | Files |
|---|---|
| 1 | `.claude/commands/marketing.md`, `.claude/commands/revenue.md` (deleted) |
| 2 | `docs/product-docs/architecture/product-overview.md` |
| 3 | `README.md` |

## Contracts preserved

No `shared/` contract, schema, API, socket, or runtime change. No `mise run gen`.

## Success criteria

- The two command files are gone.
- `grep -rniE "/marketing|/revenue|marketing agent|revenue agent" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=tasks .` returns nothing.
- `product-overview.md` states the trademark rule including where the game is promoted.
- `.claude/commands/` holds exactly `designer.md`, `engineering.md`, `implement.md`, `product.md`.

## Test plan

No code changes, so there are no package tests. The implementation agent runs the grep above and `ls .claude/commands`, and pastes both outputs in the PR body. CI's docs-only path is the gate.

## Database migration plan

None.

## Logging requirements

None. No logs or failure paths change.

## Docs to update

- `README.md` (subtask 3)
- `docs/product-docs/architecture/product-overview.md` (subtask 2)

## Branch
`technical-improvement/GH-316-remove-marketing-revenue-agents`, from and into `develop`
