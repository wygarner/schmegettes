---
task-type: improvement
task-title: "Move Go to a supported release (1.27) and keep it there"
---
# Task Brief

Implement [product-brief.md](./product-brief.md). Move `api`, `game` and `golib` from Go 1.25.14, which no longer gets security fixes, to Go 1.27. Upgrade the contract generator so its output stops calling the deprecated runtime API. Land the four blocked Dependabot updates. Add a support-window rule to the monthly runtime routine. Nothing changes for players.

## Verified before writing this spec (2026-11-24)

These were checked against `develop` at 35f28a1 with Go 1.27.4, in a throwaway checkout:

- **Supported Go releases:** go.dev lists 1.27.4 and 1.26.11.
- **Generator:** oapi-codegen v2.9.0 (latest) emits `runtime.BindQueryParameterOptions` and `runtime.BindStyledParameterOptions`, not the deprecated `BindQueryParameter`.
- **One code change:** v2.9.0 renames the room-join role enum constants: `contracts.Contestant` becomes `contracts.PostV1RoomsJoinJSONBodyRoleContestant`, and `contracts.Spectator` becomes `contracts.PostV1RoomsJoinJSONBodyRoleSpectator`. These are the only three references, all in `api/internal/rooms/handler.go`. After renaming them, `golib`, `api` and `game` build.
- **Linter:** staticcheck 2025.1.1 (pinned in `ci.yml`) can't read Go 1.27 export data (`export data version 5 is greater than maximum supported version 2`). `honnef.co/go/tools` v0.8.2 (latest) reports nothing on `api/internal/contracts`, `api/internal/rooms` and `api/cmd/api` with the new generated code and runtime v1.9.1.
- **Latest versions,** all of which need Go ≥ 1.26: oapi-codegen runtime v1.9.1, `golang.org/x/text` v0.44.0, `golang.org/x/time` v0.16.0, `keyfunc/v3` v3.9.2. These are exactly the Dependabot versions.

The full test suites were not run during this check; CI runs them on the implementation PR.

## Subtasks

### 1. Toolchain pins

Use the latest 1.27 patch at implementation time (1.27.4 as of this spec).

- `mise.toml`: `go = "1.27.4"`; update the comment.
- `api/Dockerfile`, `game/Dockerfile`: `FROM golang:1.27.4-bookworm AS build`. Leave the distroless runtime image unchanged.
- `golib/go.mod`, `api/go.mod`, `game/go.mod`: `go 1.27.0`. Don't add a `toolchain` line; mise supplies the toolchain.
- `.github/workflows/ci.yml`: replace the three `staticcheck@2025.1.1` pins with the staticcheck release that supports Go 1.27 (module `honnef.co/go/tools` v0.8.2, or its matching release tag). Keep it pinned. Leave `govulncheck@latest` as it is.

**Key files:** `mise.toml`, `api/Dockerfile`, `game/Dockerfile`, `*/go.mod`, `.github/workflows/ci.yml`

### 2. Contract generator

- `shared/scripts/gen.ts`: `oapi-codegen/v2/cmd/oapi-codegen@v2.4.1` becomes `@v2.9.0`. Keep the SA1029 file-ignore header. If v2.9.0's output no longer triggers SA1029, remove the header and say so in the PR.
- Run `mise run gen` and commit `api/internal/contracts/contracts_gen.go`. `openapi30.gen.yaml`, the TypeScript output and the Python output must not change; if any does, explain it in the PR.
- `api/internal/rooms/handler.go`: use the renamed join-role constants (above). Don't add aliases in the contracts package, which is generated.

**Key files:** `shared/scripts/gen.ts`, `api/internal/contracts/contracts_gen.go`, `api/internal/rooms/handler.go`

### 3. Dependencies

In one change, so `golib`, `api` and `game` stay consistent (both services import `golib` through a `replace ../golib`):

- `api`: `github.com/oapi-codegen/runtime` v1.9.1, `golang.org/x/time` v0.16.0
- `game`: `golang.org/x/text` v0.44.0
- `golib`: `github.com/MicahParks/keyfunc/v3` v3.9.2
- `go mod tidy` in all three; commit `go.mod` and `go.sum`.

Take newer versions if they exist at implementation time and need no further code change. After the merge, Wyatt closes #303, #126, #124 and #130 as superseded; the implementation PR links them.

### 4. Query-parameter behaviour (regression guard)

The generated code now binds query parameters through `BindQueryParameterOptions`. Before relying on it, add api tests that pin today's behaviour for every query parameter in `shared/openapi.yaml`. Write them against the router, as `api/internal/notices/handler_test.go` does, so they go through the generated binding:

- `days` on the admin notices list: absent (default 30), valid, out of range (400), not a number (400);
- every other query parameter in the contract (list them from `openapi.yaml`): absent, valid, invalid type;
- a value containing an encoded comma (`%2C`), wherever a string parameter exists, binds to the literal value.

Write the tests **first on the current generator**, check they pass, then regenerate and check they still pass. Note in the PR that both runs passed.

### 5. Runtime support-window rule (docs)

`docs/system-docs/engineering/stack.md`, the "Languages and runtime versions" row:

- Go 1.27, pinned `1.27.x`, with the date.
- The "Runtime pins" routine gains a support check. On the first Monday of each month, for each pinned runtime, check that its release line is still supported, at:
  - Go: <https://go.dev/doc/devel/release> (the two newest releases)
  - Node: <https://nodejs.org/en/about/previous-releases> (Active or Maintenance LTS)
  - Python: <https://devguide.python.org/versions/> (bugfix or security)
  - Bun: the latest minor at <https://bun.sh/blog>

  If a pinned line has lost support, or will within 30 days, open the upgrade (as a task, if code changes are needed) within a month.
- Record "Last support check: YYYY-MM-DD" in the row.

**Key files:** `docs/system-docs/engineering/stack.md`

## Contracts preserved

- `shared/openapi.yaml`, `shared/schemas/protocol/` and `shared/schemas/jobs/` are unchanged.
- The generated Go code changes because the generator version changes. The HTTP contract (paths, parameters, bodies, status codes) doesn't, and subtask 4's tests guard query-parameter parsing.
- The TypeScript and Python generated code are unchanged.

## Database migration plan

None.

## Logging requirements

None. No log lines change.

## Success criteria

1. `mise exec -- go version`, CI's Go jobs and both Dockerfile build stages use Go 1.27.x. All three `go.mod` files say `go 1.27.0`.
2. CI passes on golib, api, game, Shared Contracts and Boot, with staticcheck pinned to the Go 1.27-capable release and no new lint exceptions.
3. `mise run gen` on a clean checkout reproduces the committed generated code exactly.
4. The subtask 4 tests pass before and after regeneration.
5. Coverage stays at or above the floors in `scripts/coverage-floors.json`.
6. Dependency versions are at least those of #303, #126, #124 and #130.
7. After merging, the automatic staging deploy passes all three version checks, and Wyatt plays one full staging game (smoke check).
8. `stack.md` records Go 1.27, the support-window rule with its links, and the last-check date.

## Test plan

```bash
mise install
mise run gen
mise run test:api -- ./internal/rooms/... ./internal/notices/... ./internal/contracts/...   # plus the new query-parameter tests
mise run test:game -- ./internal/room/...    # targeted; CI runs the rest
cd golib && go build ./... && go vet ./...
go run honnef.co/go/tools/cmd/staticcheck@<pinned> ./...   # in api, game, golib
git diff --check
```

Run gofmt and go vet in each module you touch. Don't run full package suites locally; CI does.

## Docs to update

- `docs/system-docs/engineering/stack.md` (subtask 5)
- `mise.toml` comment
- No product docs.
