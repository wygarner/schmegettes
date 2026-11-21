# Contracts

**Source of truth:** `shared/openapi.yaml`, `shared/schemas/`

All contracts live in `shared/`. That package builds first and depends on nothing in the repo.

| Contract | File | Consumers | How each consumes it |
|---|---|---|---|
| Domain vocabulary | `shared/schemas/domain.schema.json` | all | generated types; Postgres enums mirror it |
| REST | `shared/openapi.yaml` | web (client), api (server) | TS: `openapi-typescript` + `openapi-fetch`. Go: types and server interface generated with `oapi-codegen` into `api/internal/contracts`; handler tests validate responses against the spec (`kin-openapi`) |
| WebSocket | `shared/schemas/protocol/*.schema.json` | web, game | TS types; Go structs (`go-jsonschema`) in `game/internal/contracts` |
| Jobs | `shared/schemas/jobs/job.schema.json` | api, game (produce), worker (consume) | Python models (`datamodel-code-generator`); Go structs (`go-jsonschema`), validated before enqueue |

## Rules

- **A contract change is an explicit, reviewed change.** The task spec says so, and the PR touches `shared/` and every consumer together.
- **Generated code is committed.** Run `mise run gen` after editing `shared/`. CI regenerates and fails on any diff.
- **Additive by default.** New optional fields and new message types are compatible. Removing or renaming a field, or adding a required one, is breaking: it needs a version bump of the socket subprotocol (`schmegettes.v2`) or REST path (`/v2`) and a period where both are served.
- REST errors use RFC 9457 problem details (`application/problem+json`). The `type` ends in `/problems/{kind}`, and clients switch on the kind: for example `not-a-host` (403 on `POST /v1/rooms` without host access), `invalid-code` (400 on `POST /v1/host-access/redeem`; wrong, expired, manually retired, and malformed codes look the same), `rate-limited` (429 with `Retry-After` in seconds, on any route but `/healthz` and `/version`; groups and numbers in [security-model.md](../security/security-model.md), "Rate limits"). Accounts (`/v1/me`): `not-signed-in` (403, a guest asked for an account action), `not-a-guest` (409, an account asked for a merge ticket), `invalid-ticket` (400), `guest-in-game` (409, the guest being merged is mid-game), `in-game` (409, deleting an account mid-game), `invalid-name` (400). Room options (`PATCH /v1/rooms/{roomId}`): `not-the-host` (403), `game-started` (409, options lock at Start), `invalid-settings` (400, seasons empty or outside 1–40). Rejoin and resume: `not-in-game` (403 on `POST /v1/rooms/join`, a resume lobby the caller didn't play in), `not-the-host` (403) and `not-resumable` (409) on `POST /v1/games/{gameId}/resume`; `GET /v1/me/current-room` answers 204 when the caller is in no room.
- Stats routes are `GET /v1/me/stats` and `GET /v1/leaderboard`. Both refuse guests with `not-signed-in`; the leaderboard additionally refuses an account with no counted games using `no-counted-games`. Leaderboard rows contain no user ID or email. `PATCH /v1/me` accepts either `accountName`, `showOnLeaderboard`, or both.
- Every endpoint except `/healthz` and `/version` requires a Supabase JWT.
- **Admin routes (`/v1/admin/*`) hide themselves.** No token, a bad token, a guest, and a signed-in non-admin all get exactly the response of an unknown path (404 `not-found`), never 401 or 403. They share one `admin` rate limit (5/min per user; unauthenticated attempts share one bucket). Used by the devtools Admin page, the web app's `/admin` (host code and rotate only), `scripts/staff-access.mjs`, and `scripts/qa-accounts.mjs`. `GET /v1/me` carries `isAdmin: true` for an admin (from `private.caller_is_admin()`) and no `isAdmin` key for anyone else, so the web knows whether to show its Admin row without calling an admin route. Staff access (`/v1/admin/staff-access`): `invalid-grant` (400: unknown subject type, a subject that doesn't exist, a reason outside 1–200 characters, or minutes outside 1–480) and `grant-inactive` (403: the grant is expired, revoked, unknown, or another admin's). `GET /v1/admin/audit` returns at most 500 entries, newest first. `GET /v1/admin/cleanup-runs` returns the last 30 guest-cleanup runs (counts only). `POST /v1/admin/qa-accounts` marks account IDs as QA; `POST /v1/admin/qa-cleanup` previews or removes all-QA rooms and games, with production clamped to at least 24 hours.
