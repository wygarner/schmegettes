# Schmegettes

A multiplayer quiz-show party game. Packages: `shared/` (contracts), `web/` (React), `devtools/` (prototypes), `api/` (Go, REST), `game/` (Go, WebSocket), `worker/` (Python), `supabase/` (migrations, RLS). Operational content (`docs/`, `tasks/`, `releases/`) lives in the same repo.

## Read first

- Stack and access patterns: `docs/system-docs/engineering/stack.md`
- Lifecycle: `docs/system-docs/engineering/development-workflow.md`
- Everything else: `docs/system-docs/README.md`

## Constraint

Operate only inside this repository (`~/schmegettes/`) and its worktrees (`~/schmegettes-SCH-{N}/`) unless the human explicitly says otherwise.

## Change discipline

- Smallest safe diff. Preserve runtime behavior unless told otherwise.
- Contracts in `shared/` change only when the task says so; run `mise run gen` and commit the output.
- Every new table gets RLS, explicit grants, and a test in `supabase/tests/`.
- Run targeted tests for what you touched. Never run a full suite locally; CI does that on every PR into `develop`.
- Never call the Jira API. GitHub Actions own every Jira write.
- Never put secrets in `.claude/settings*.json`, commits, or logs. Approvals for commands that carry a token go in `.claude/settings.local.json` (git-ignored); better, the token comes from the environment.
