# Stack Decision Record

**Source of truth:** `mise.toml`, package manifests (`package.json`, `*/go.mod`, `worker/pyproject.toml`)

Every other doc, agent prompt, and CI job refers to this file instead of repeating stack choices. When a decision changes, update this file in the same PR as the change.

**Last updated:** 2026-11-09 (error tracker, alerting, backups, and config switch rows added; unbuilt parts marked)

## Context

Schmegettes is a multiplayer quiz-show party game. An earlier prototype (`wygarner/Schmegettes`, `wygarner/Schmegettes-Backend`) was a React/Vite client and a single-file Express + `ws` server on Fly.io. That server kept games in memory, broadcast every update to every connected client, and ran timers client-triggered.

Two goals shape the stack:

1. **A game that holds up with real players.** The server owns game state and timers. Updates reach only the players in a room. Rooms survive a deploy.
2. **Learning Go and Python.** Go runs the request/response and realtime servers; Python runs background jobs and LLM work. Contracts between them are language-neutral.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Languages and runtime versions | TypeScript (web, devtools, shared codegen); Go 1.25 (`api/`, `game/`); Python 3.13 (`worker/`). All pinned in root `mise.toml`. | Learning goal. Each language takes the job it's best suited to (see Components). One pin file means local, CI, and deploys build with the same versions. |
| Package manager / workspace tool | **mise** for toolchains and repo tasks. Per-language package managers: Bun 1.3 workspaces (`shared`, `web`, `devtools`), Go modules (one per service: `api/`, `game/`), uv. | The guide's "one workspace, one lockfile" can't hold across three languages, so the rule becomes one lockfile per language or Go module (`bun.lock`, `go.sum`, `uv.lock`), with mise tasks as the single entry point. |
| Client framework and build tool | React 19 + Vite 8 + TypeScript 5.9, React Router 8. Supabase JS client used **for auth only**. TypeScript stays on 5.x until `openapi-typescript` supports TypeScript 7 (it needs the JS compiler API, which 7 removed). | Same as the prototype, so its board/clue UI can be ported. |
| Component library | **Mantine 9** (`@mantine/core`, `@mantine/hooks`). Fonts (Oswald, Inter) are self-hosted with **Fontsource** (`@fontsource/oswald`, `@fontsource/inter`), bundled by Vite; no font CDN. | One self-contained package that prototypes can import alone. Theming fits a custom game-show look. |
| API style and server framework | **REST** (Go, standard library `net/http` router) for profiles, rooms, and history. Contract: `shared/openapi.yaml` (OpenAPI 3.1). **WebSocket** (Go, `coder/websocket`) for live gameplay. Contract: `shared/schemas/protocol/*.schema.json` (JSON Schema 2020-12). | Gameplay is a stream of small events (buzz, judge, tick), so it needs a socket, not request/response. Setup data is plain CRUD; a small stateless Go service handles it, separate from `game/` so REST deploys never drop live sockets. Both contracts are language-neutral files, and changing them is a reviewed change. |
| Database, ORM / query layer, migration tool | **Supabase Postgres**. Migrations: plain SQL in `supabase/migrations/`, applied by the Supabase CLI (the only migration tool). Access: `pgx` + `sqlc` in Go; `psycopg` 3 in Python. | Two languages share one schema, so migrations are SQL that no single framework owns. |
| Tenant isolation mechanism | No organizations: a consumer game. The isolation scope is **the user** (own profile, own boards) and **room membership** (room state, answers, scores). Enforced by Postgres row-level security using `auth.uid()`. Every service opens a transaction, runs `set local role authenticated` and `set_config('request.jwt.claims', <verified claims>, true)`, then queries, so RLS applies per transaction. Only migrations and the worker's import jobs use the owner role. | Isolation lives in the database, not in scattered `WHERE` clauses, and is built into the first migration. See [data-and-isolation.md](../architecture/data-and-isolation.md). |
| Identity provider | **Supabase Auth**. Players start with **anonymous sign-in** (replaces the prototype's browser fingerprint) and can link Google or email later without losing history. Services verify the Supabase JWT against the project's JWKS (asymmetric signing keys) on every request and socket connect. | One auth boundary. No package rolls its own. Anonymous-first keeps "join with a code" frictionless. |
| Cache / broker / job queue | **Redis** for realtime fan-out (pub/sub channel per room) and room ownership leases. **Supabase Queues (pgmq)** for background jobs. The job envelope is defined in `shared/schemas/jobs/`. **Not yet implemented:** no service uses Redis yet (rooms run on one `game/` instance; see [realtime-game-server.md](../architecture/realtime-game-server.md)), and the worker's queue loop is not built. | Pub/sub lets any game-server instance relay a room's events. pgmq keeps jobs transactional with the data that created them and needs no extra broker for the Go → Python handoff. |
| Test frameworks (unit, component, end-to-end) | Web/devtools: Vitest 5 + Testing Library. Go: `go test` (`-race`). Python: pytest. Database: pgTAP via `supabase test db` (RLS tests). End-to-end: Playwright, run on release branches only. | Each language's default, so the learning effort goes into the language rather than the test framework. |
| Lint and format | TS: Biome. Go: `gofmt` + `go vet` + `staticcheck`. Python: Ruff (lint + format) + mypy. SQL: `supabase db lint`. | One formatter per language, all runnable in CI without config debates. |
| Log, metric, and trace backend; retention and access | **Grafana Cloud** over OpenTelemetry (OTLP): logs, traces, metrics. **Not yet implemented:** no service ships telemetry yet; logs go to stdout only. Built today: structured JSON logs (Go `log/slog`, Python `structlog`), and `GET /healthz` and `GET /version` on `api` and `game` (`worker` has no HTTP server). Retention: the Grafana Cloud plan default, to be confirmed when the Grafana Cloud stack is created. Access: Wyatt Garner only. | One backend for every language. OTel has first-party SDKs for both. Logs carry user and room IDs, so access is limited. See [logging-conventions.md](../operations/logging-conventions.md). |
| Error tracker (server and client) | **Grafana.** Web: Grafana Faro. Servers: error counters plus logs in Grafana Cloud, no separate hosted tracker (decided 2026-11-09). **Not yet implemented.** | One backend for logs, metrics, traces, and errors. |
| Alert routing, uptime checks, and who is on call | Grafana Alerting, with rules kept as code in the repo. An uptime check from outside the hosting platform on each public `/healthz`. On call: Wyatt Garner. Contact point: email (decided 2026-11-09). **Not yet implemented.** | A service can't report its own death; alerts must reach a human without anyone watching a dashboard. |
| Backup, off-account export, RPO and RTO | Supabase managed backups. Scheduled logical export (`pg_dump`) to storage in a separate account: **Not yet implemented**. RPO 24 h, RTO 4 h (decided 2026-11-09). | A party game with no payments can lose a day of history; the export covers a lost or compromised Supabase account. |
| Config switch mechanism | **Environment variables**, one per switch; a restart picks up a new value (decided 2026-11-09). Switches are listed in [configuration-and-secrets.md](../security/configuration-and-secrets.md). | No flag service to run. A restart is fast enough for this product. |
| AI features | Answer judging starts deterministic (normalization + fuzzy match, in Go, so buzz-to-verdict is instant). An optional LLM "appeal" judge runs in the Python worker. Prompts live in `worker/prompts/`; the eval harness is in `evals/` and runs in CI as a non-blocking check. **Not yet implemented:** the fuzzy judge is built (`game/internal/judge`); the LLM judge, `worker/prompts/`, and the eval harness are not (`evals/` holds only a README). | Fuzzy match handles most answers in microseconds. The LLM handles the disputed ones and is measured before it ships. |
| Hosting per component | **To be decided.** Requirements are in [deployment.md](../operations/deployment.md). Candidates: Fly.io (prototype used it; good for Go WebSockets), Render, Railway; web on Cloudflare Pages or Vercel. Supabase hosts the database and auth either way. | Deferred on purpose. The deploy contract is host-agnostic: every component reports its commit at `/version`. |

## Components

| Package | Language | Owns | Talks to |
|---|---|---|---|
| `shared/` | JSON Schema, OpenAPI, TS codegen | Domain vocabulary (game phases, rounds, roles, event names), REST and WebSocket contracts, job envelopes. Depends on nothing. Builds first. | — |
| `web/` | TypeScript / React | Player and host UI: lobby, board, clue, buzzer, scores. Voice input (Web Speech API). | Supabase Auth, `api` (REST), `game` (WebSocket) |
| `devtools/` | TypeScript / React | Internal-only prototype host for `/designer`. Never deployed publicly. | — |
| `api/` | Go (`net/http`) | Profiles, rooms (create/join by code, settings), game history, enqueueing jobs. Stateless. | Postgres, pgmq |
| `game/` | Go | Live game state machine: phases, buzzer lockout and ordering, timers, scoring, judging verdicts. Server-authoritative. | Postgres (load board, persist results), Redis (fan-out, ownership) |
| `worker/` | Python | Background jobs: import clue datasets (the prototype's clue dataset TSVs), build boards, LLM appeal judging, stats rollups. | Postgres, pgmq, LLM API |
| `supabase/` | SQL | Migrations, RLS policies, seed data, pgTAP tests. | — |

## Access patterns (for implementation agents)

- **Data access always runs as the user.** Use the per-language helper (`db.AsUser(ctx, claims, fn)` in Go, `with as_user(conn, claims):` in Python). It opens a transaction and sets the role and JWT claims. Never query tenant-scoped tables outside it. Owner-role connections are only for migrations and worker import jobs, and are named `*_OWNER_URL`.
- **Contracts are generated, not hand-written.** Change `shared/`, run `mise run gen`, commit the generated files. CI fails if generated code is stale.
- **Game state changes only in `game/`.** The api never mutates a live game. It creates the room; `game` builds the board and takes over when the host starts.
- **Shared Go code** lives in `golib/`, a Go module that `api/` and `game/` both import through a `replace` directive: `auth` (JWT verification against the JWKS), `db` (`AsUser`, and `AsEngine` for `game/`'s `game_engine` calls), and `logging`.
- **`api/` contract code** comes from `oapi-codegen`, which reads OpenAPI 3.0 only, so `mise run gen` writes a 3.0 copy of `shared/openapi.yaml` (`api/internal/contracts/openapi30.gen.yaml`) and generates from it. Handler tests validate responses against that copy.
- **Background work goes through pgmq** with an envelope from `shared/schemas/jobs/`, never a long request.
