# Developer Setup

## 1. Toolchains

Everything is pinned in the root `mise.toml`.

```bash
brew install mise            # or: curl https://mise.run | sh
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc && exec zsh
cd ~/schmegettes
mise trust && mise install   # node, bun, go, ruby, python, uv, supabase CLI
```

Local Supabase also needs Docker (Docker Desktop, OrbStack, or Colima).

## 2. Dependencies and generated code

```bash
mise run setup
```

## 3. Local database

```bash
supabase gen signing-key --algorithm ES256 > supabase/signing_keys.json   # once; git-ignored
mise run db:start      # prints the local URL and anon key
mise run db:reset      # re-apply migrations + seed any time
mise run db:test       # RLS tests
```

## 4. Environment files

Copy each `.env.example` next to it (`web/.env.local`, `api/.env`, `game/.env`, `worker/.env`) and fill in the anon key from `db:start`. Local env files point at local Supabase only. Staging and production credentials are never put in a local file.

## 5. Run

`bun run dev` starts web, game, and worker in one terminal (`mise run dev`). Start Redis first. The API is not in it yet; run it on its own.

Or one service per terminal:

```bash
redis-server
mise run dev:api        # :3001
mise run dev:game       # :3002
mise run dev:worker
mise run dev:web        # :5173
mise run dev:devtools   # :5174, prototypes
```

## Testing

Run the tests for what you changed. See [development-workflow.md](./development-workflow.md), "Validation".
