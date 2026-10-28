# api/ — Go REST server

Profiles, rooms (create, join by code, settings), and game history. Contract: [`shared/openapi.yaml`](../shared/openapi.yaml). Stack decisions: [`docs/system-docs/engineering/stack.md`](../docs/system-docs/engineering/stack.md).

Stateless and separate from `game/`, so REST deploys never drop live game sockets.

```bash
mise run dev:api                                  # :3001
mise run test:api -- ./internal/rooms/...         # targeted tests
```

## Layout

| Path | What |
|---|---|
| `cmd/api/` | Entry point: routes, `/healthz`, `/version`, graceful shutdown |
| `internal/contracts/` | Types and server interface generated from `shared/openapi.yaml` (`oapi-codegen`, via `mise run gen`). Never edited by hand. |
| `internal/{resource}/` | Handlers per resource (`rooms`, `games`, `me`) |
| `internal/server/` | Auth, CORS, request ids, request logging, problem responses |
| `internal/rooms/` | `POST /v1/rooms`, `POST /v1/rooms/join`, `GET /v1/rooms/by-code/{code}` |
| `../golib/` | Go code shared with `game/` (JWT verification, `db.AsUser`, logger setup), imported with a `replace` directive |

## Rules

| Concern | How |
|---|---|
| Migrations | The Supabase CLI owns the schema. This service never changes it. |
| Database role | `DATABASE_URL` is the `app_service` role. Every handler that reads user data runs inside `db.AsUser(ctx, claims, fn)`: one transaction, `set local role authenticated`, `select set_config('request.jwt.claims', $1, true)`. |
| Auth | Verify `Authorization: Bearer` against `SUPABASE_JWKS_URL` (cache the JWKS), check `aud = authenticated` and `exp`. Every route except `/healthz` and `/version`. |
| Contract | Handlers implement the generated server interface. Handler tests validate responses against `../shared/openapi.yaml` (`kin-openapi`). |
| Errors | RFC 9457 problem details (`application/problem+json`). |
| CORS | Origins from `ALLOWED_ORIGINS` only. |
| Logging | `log/slog` JSON, one line per request, fields per [logging-conventions.md](../docs/system-docs/operations/logging-conventions.md). Never log the `Authorization` header. |
| Health | `GET /healthz` (checks the DB connection once the pool exists) and `GET /version` → `{ "service": "api", "commit": GIT_SHA }`. |
| Jobs | Enqueue with `select pgmq.send('jobs', $1::jsonb)` in the same transaction as the data it relates to, after validating against `../shared/schemas/jobs/job.schema.json`. |
| Port | `PORT=3001` (web expects it). |

## Environment

See `.env.example`. `GAME_SOCKET_BASE_URL` is game/'s public WebSocket URL; room responses append `/rooms/{id}/ws`.

The rooms integration test (`internal/rooms/store_test.go`) runs against local Supabase when `SUPABASE_ANON_KEY` is set (`supabase status -o env` prints it as `ANON_KEY`).
