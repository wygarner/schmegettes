# Schmegettes

A multiplayer Jeopardy!-style party game: share a room code, buzz from your phone, answer by typing or speaking. (Schmegettes is not affiliated with Jeopardy! or Sony.)

| Package | Language | What it is |
|---|---|---|
| [`shared/`](shared/) | JSON Schema / OpenAPI | Contracts and domain vocabulary. Builds first. |
| [`web/`](web/) | TypeScript, React, Mantine | Player and host UI |
| [`devtools/`](devtools/) | TypeScript | Internal prototype host |
| [`api/`](api/SETUP.md) | Ruby on Rails | REST: profiles, rooms, boards, history |
| [`game/`](game/) | Go | Realtime game server (WebSockets) |
| [`worker/`](worker/) | Python | Jobs: clue imports, boards, appeal judging |
| [`supabase/`](supabase/) | SQL | Migrations, row-level security, tests |

Start with [docs/system-docs/engineering/stack.md](docs/system-docs/engineering/stack.md) and [developer-setup.md](docs/system-docs/engineering/developer-setup.md).

```bash
mise install && mise run setup
mise run db:start
bun run dev             # web, game, and worker together
```

Agents: `/product`, `/engineering`, `/implement`, `/designer`, `/marketing`, `/revenue` (in `.claude/commands/`). The lifecycle is in [development-workflow.md](docs/system-docs/engineering/development-workflow.md).
