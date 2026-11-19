# Schmegettes

A multiplayer quiz-show party game: share a room code, buzz from your phone, answer by typing or speaking.

| Package | Language | What it is |
|---|---|---|
| [`shared/`](shared/) | JSON Schema / OpenAPI | Contracts and domain vocabulary. Builds first. |
| [`web/`](web/) | TypeScript, React, Mantine | Player and host UI |
| [`devtools/`](devtools/) | TypeScript | Internal prototype host |
| [`api/`](api/SETUP.md) | Go | REST: profiles, rooms, game history |
| [`game/`](game/) | Go | Realtime game server (WebSockets) |
| [`worker/`](worker/) | Python | Jobs: clue imports, boards, appeal judging |
| [`supabase/`](supabase/) | SQL | Migrations, row-level security, tests |

Start with [docs/system-docs/engineering/stack.md](docs/system-docs/engineering/stack.md) and [developer-setup.md](docs/system-docs/engineering/developer-setup.md).

```bash
mise install && mise run setup
mise run db:start       # first time: prints the anon key for the .env files
bun run dev             # starts local Supabase if needed, then web, api, game, and worker
```

Agents: `/product`, `/engineering`, `/implement`, `/designer`, `/marketing`, `/revenue` (in `.claude/commands/`). The lifecycle is in [development-workflow.md](docs/system-docs/engineering/development-workflow.md).
