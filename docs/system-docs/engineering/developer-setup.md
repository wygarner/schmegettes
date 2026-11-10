# Developer Setup

**Source of truth:** `mise.toml`, `*/.env.example`, `supabase/config.toml`

## 1. Toolchains

Everything is pinned in the root `mise.toml`.

```bash
brew install mise            # or: curl https://mise.run | sh
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc && exec zsh
cd ~/schmegettes
mise trust && mise install   # node, bun, go, python, uv, supabase CLI
```

Local Supabase also needs Docker (Docker Desktop, OrbStack, or Colima).

## 2. Dependencies and generated code

```bash
mise run setup
```

## 3. Local database

```bash
# once; git-ignored. config.toml points at this file, so the CLI writes it itself:
# create a placeholder, then answer "Yes" when asked to overwrite it. Don't redirect with `>`.
echo '[]' > supabase/signing_keys.json
supabase gen signing-key --algorithm ES256
mise run db:start      # prints the local URL and anon key
mise run db:reset      # re-apply migrations + seed any time
mise run db:test       # RLS tests
```

Hosting needs host access. Locally, enter **`DEVS-TEST`** when **Host a game** asks for a code. It works once; after that, read the new code with `select code from public.host_codes where used_at is null;` (Studio's SQL editor), or `mise run db:reset`. Auth settings (`[auth.*]` in `config.toml`) take effect on `supabase stop && mise run db:start`, not on `db:reset`.

## 4. Environment files

Copy each `.env.example` next to it (`web/.env.local`, `api/.env`, `game/.env`, `worker/.env`) and fill in the anon key from `db:start`. Local env files point at local Supabase only. Staging and production credentials are never put in a local file.

### Apple and Google sign-in (optional)

Everything but signing in works without this. To sign in locally, create a development Apple Services ID and a Google OAuth client whose redirect URL is `http://127.0.0.1:54321/auth/v1/callback`, then export the four `SUPABASE_AUTH_EXTERNAL_{APPLE,GOOGLE}_{CLIENT_ID,SECRET}` variables in your shell (never in a committed file) and restart Supabase (`supabase stop && mise run db:start`).

### Real clues (optional)

The seed has only "SAMPLE" categories. To play with real clues, load a few seasons into local Supabase (about 1 s per season; safe to run again):

```bash
mise run clues:import -- --seasons 1-3     # all 40 seasons: about 160 MB, 40 s
```

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
