# Stack Decision Record

Every other doc, agent prompt, and CI job refers to this file instead of repeating stack choices. When a decision changes, update this file in the same PR as the change.

**Last updated:** 2026-10-26

## Context

Schmegettes is a multiplayer Jeopardy!-style party game, modeled on the Weekend Games version (weekend.com/games/jeopardy). An earlier prototype (`wygarner/Schmegettes`, `wygarner/Schmegettes-Backend`) was a React/Vite client and a single-file Express + `ws` server on Fly.io. That server kept games in memory, broadcast every update to every connected client, and ran timers client-triggered.

Two goals shape the stack:

1. **A game that holds up with real players.** The server owns game state and timers. Updates reach only the players in a room. Rooms survive a deploy.
2. **Learning Go, Ruby on Rails, and Python.** Each backend language gets the job it's best suited to, and contracts between them are language-neutral.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Languages and runtime versions | TypeScript (web, devtools, shared codegen); Go 1.25 (`game/`); Ruby 3.4 + Rails 8 (`api/`); Python 3.13 (`worker/`). All pinned in root `mise.toml`. | Learning goal. Each language takes the job it's best suited to (see Components). One pin file means local, CI, and deploys build with the same versions. |
| Package manager / workspace tool | **mise** for toolchains and repo tasks. Per-language package managers: Bun 1.3 workspaces (`shared`, `web`, `devtools`), Go modules, Bundler, uv. | The guide's "one workspace, one lockfile" can't hold across four languages, so the rule becomes one lockfile per language (`bun.lock`, `go.sum`, `Gemfile.lock`, `uv.lock`), with mise tasks as the single entry point. |
| Client framework and build tool | React 19 + Vite 8 + TypeScript 5.9, React Router 8. Supabase JS client used **for auth only**. TypeScript stays on 5.x until `openapi-typescript` supports TypeScript 7 (it needs the JS compiler API, which 7 removed). | Same as the prototype, so its board/clue UI can be ported. |
| Component library | **Mantine 9** (`@mantine/core`, `@mantine/hooks`). | One self-contained package that prototypes can import alone. Theming fits a custom game-show look. |
| API style and server framework | **REST** (Rails 8 API-only) for accounts, rooms, boards, clue sets, and history. Contract: `shared/openapi.yaml` (OpenAPI 3.1). **WebSocket** (Go, `coder/websocket`) for live gameplay. Contract: `shared/schemas/protocol/*.schema.json` (JSON Schema 2020-12). | Gameplay is a stream of small events (buzz, judge, tick), so it needs a socket, not request/response. Setup data is plain CRUD, and Rails does CRUD well. Both contracts are language-neutral files, and changing them is a reviewed change. |
| Database, ORM / query layer, migration tool | **Supabase Postgres**. Migrations: plain SQL in `supabase/migrations/`, applied by the Supabase CLI (the only migration tool; Rails does not run migrations). Access: ActiveRecord in Rails (`schema.rb` not used; models map to existing tables); `pgx` + `sqlc` in Go; `psycopg` 3 in Python. | Three languages share one schema, so migrations are SQL that no single framework owns. |
| Tenant isolation mechanism | No organizations: a consumer game. The isolation scope is **the user** (own profile, own boards) and **room membership** (room state, answers, scores). Enforced by Postgres row-level security using `auth.uid()`. Every service opens a transaction, runs `set local role authenticated` and `set_config('request.jwt.claims', <verified claims>, true)`, then queries, so RLS applies per transaction. Only migrations and the worker's import jobs use the owner role. | Isolation lives in the database, not in scattered `WHERE` clauses, and is built into the first migration. See [data-and-isolation.md](../architecture/data-and-isolation.md). |
| Identity provider | **Supabase Auth**. Players start with **anonymous sign-in** (replaces the prototype's browser fingerprint) and can link Google or email later without losing history. Services verify the Supabase JWT against the project's JWKS (asymmetric signing keys) on every request and socket connect. | One auth boundary. No package rolls its own. Anonymous-first keeps "join with a code" frictionless. |
| Cache / broker / job queue | **Redis** for realtime fan-out (pub/sub channel per room) and room ownership leases. **Supabase Queues (pgmq)** for background jobs. The job envelope is defined in `shared/schemas/jobs/`. | Pub/sub lets any game-server instance relay a room's events. pgmq keeps jobs transactional with the data that created them and needs no extra broker for Rails → Python handoff. |
| Test frameworks (unit, component, end-to-end) | Web/devtools: Vitest 5 + Testing Library. Go: `go test` (`-race`). Rails: Minitest (Rails default). Python: pytest. Database: pgTAP via `supabase test db` (RLS tests). End-to-end: Playwright, run on release branches only. | Each language's default, so the learning effort goes into the language rather than the test framework. |
| Lint and format | TS: Biome. Go: `gofmt` + `go vet` + `staticcheck`. Ruby: RuboCop (`rubocop-rails-omakase`, Rails 8 default). Python: Ruff (lint + format) + mypy. SQL: `supabase db lint`. | One formatter per language, all runnable in CI without config debates. |
| Observability backend | **Grafana Cloud** over OpenTelemetry (OTLP): logs, traces, metrics. Structured JSON logs: Go `log/slog`, Rails `lograge` + JSON formatter, Python `structlog`. Every service exposes `GET /healthz` and `GET /version`. | One backend for every language. OTel has first-party SDKs for all three. See [logging-conventions.md](../operations/logging-conventions.md). |
| AI features | Answer judging starts deterministic (normalization + fuzzy match, in Go, so buzz-to-verdict is instant). An optional LLM "appeal" judge runs in the Python worker. Prompts live in `worker/prompts/`; the eval harness is in `evals/` and runs in CI as a non-blocking check. | Fuzzy match handles most answers in microseconds. The LLM handles the disputed ones and is measured before it ships. |
| Hosting per component | **To be decided.** Requirements are in [deployment.md](../operations/deployment.md). Candidates: Fly.io (prototype used it; good for Go WebSockets), Render, Railway; web on Cloudflare Pages or Vercel. Supabase hosts the database and auth either way. | Deferred on purpose. The deploy contract is host-agnostic: every component reports its commit at `/version`. |

## Components

| Package | Language | Owns | Talks to |
|---|---|---|---|
| `shared/` | JSON Schema, OpenAPI, TS codegen | Domain vocabulary (game phases, rounds, roles, event names), REST and WebSocket contracts, job envelopes. Depends on nothing. Builds first. | — |
| `web/` | TypeScript / React | Player and host UI: lobby, board, clue, buzzer, scores. Voice input (Web Speech API). | Supabase Auth, `api` (REST), `game` (WebSocket) |
| `devtools/` | TypeScript / React | Internal-only prototype host for `/designer`. Never deployed publicly. | — |
| `api/` | Ruby on Rails 8 (API-only) | Profiles, rooms (create/join by code), boards and clue sets, game history, enqueueing jobs. | Postgres, pgmq |
| `game/` | Go | Live game state machine: phases, buzzer lockout and ordering, timers, scoring, judging verdicts. Server-authoritative. | Postgres (load board, persist results), Redis (fan-out, ownership) |
| `worker/` | Python | Background jobs: import clue datasets (the prototype's `jeopardy_clue_dataset` TSVs), build boards, LLM appeal judging, stats rollups. | Postgres, pgmq, LLM API |
| `supabase/` | SQL | Migrations, RLS policies, seed data, pgTAP tests. | — |

## Access patterns (for implementation agents)

- **Data access always runs as the user.** Use the per-language helper (`Db.as_user(claims) { ... }` in Rails, `db.AsUser(ctx, claims, fn)` in Go, `with as_user(conn, claims):` in Python). It opens a transaction and sets the role and JWT claims. Never query tenant-scoped tables outside it. Owner-role connections are only for migrations and worker import jobs, and are named `*_OWNER_URL`.
- **Contracts are generated, not hand-written.** Change `shared/`, run `mise run gen`, commit the generated files. CI fails if generated code is stale.
- **Game state changes only in `game/`.** Rails never mutates a live game. It creates the room and board; `game` takes over when the host starts.
- **Background work goes through pgmq** with an envelope from `shared/schemas/jobs/`, never a long request.
