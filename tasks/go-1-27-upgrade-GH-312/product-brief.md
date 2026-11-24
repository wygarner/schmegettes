---
task-type: improvement
task-title: "Move Go to a supported release (1.27) and keep it there"
---
**Task Type:** Improvement. Toolchain and security maintenance; no player-facing change.

**Problem:** `api`, `game` and `golib` run on Go 1.25.14 (`mise.toml`, both Dockerfiles, `go 1.25.0` in each `go.mod`). Go supports only its two newest releases, now **1.27 and 1.26**. Go 1.25 has received no security fixes since Go 1.27 shipped in August 2026, so the services are built with an unsupported compiler and standard library, including `net/http` and `crypto/tls`, which face the internet.

It also blocks dependency updates. Four Dependabot PRs fail and can't merge:
- **#303:** oapi-codegen runtime 1.1.1 → 1.9.1 (api). It raises `go.mod` to 1.26, and deprecates `runtime.BindQueryParameter`, which our generated `contracts_gen.go` calls, so staticcheck fails (SA1019). The generator we pin (oapi-codegen v2.4.1, in `shared/scripts/gen.ts`) still emits that call.
- **#126:** `golang.org/x/text` 0.41 → 0.44 (game). Requires Go 1.26.
- **#124:** `golang.org/x/time` 0.15 → 0.16 (api). Requires Go 1.26.
- **#130:** `keyfunc` 3.8.2 → 3.9.2 (golib). Dependabot updates only `golib/go.mod`, but `api` and `game` build against the local `golib`, so their `go.mod`/`go.sum` must change in the same PR.

We fell behind because the monthly runtime-pin routine (`stack.md`, "Runtime pins") bumps only patch versions, so nothing prompts a minor-version upgrade before support ends.

**Decisions (Wyatt Garner, 2026-11-24):**
1. **Target Go 1.27**, the newest release, supported until about August 2027. Not 1.26, which loses support around February 2027.
2. **Change the routine so this doesn't recur** (outcome 4).

**Outcomes:**
1. **One Go version everywhere:** `mise.toml`, both `golang:` Dockerfile images, and the `go` line in `api`, `game` and `golib` all name Go 1.27 (latest patch at implementation time). CI, local builds and deploys use the same compiler.
2. **Generated contracts are current:** the contract code generator is upgraded to a version whose output uses the non-deprecated runtime API, and `mise run gen` output is committed. The REST contract (`shared/openapi.yaml`) does not change, and neither does request/response behaviour, including how query parameters are parsed.
3. **The blocked dependency updates land:** the changes from #303, #126, #124 and #130 are applied (or superseded by newer versions), with `api`/`game` kept in step with `golib`. The four Dependabot PRs are then closed as superseded.
4. **The routine catches minor versions:** the monthly runtime-pin routine in `stack.md` also checks whether each pinned runtime (Go, Node, Python, Bun) is still a supported release, and moves to a supported minor or major version **within a month** of the pinned one losing support. The routine says where to check each runtime's support window.

**Player flow:** none. Players see no change. The release notes say nothing beyond "maintenance".

**Success Criteria:**
- `go version` in CI, in each Dockerfile build stage, and via `mise exec -- go version` locally reports 1.27.x.
- CI passes on every Go package, with no staticcheck exceptions added for deprecations.
- `mise run gen` reproduces the committed generated code exactly.
- Existing api route tests and contract-validation tests pass unchanged. Query parameters (`days`, paging, filters) behave as before, including values that contain commas.
- The staging deploy succeeds with all three version checks. A full staging game works (smoke check by Wyatt).
- #303, #126, #124 and #130 are closed as superseded, and no open Dependabot PR is blocked by the Go version.
- `stack.md` records Go 1.27, the support-window rule, and the date.

**Out of scope:** Upgrading Node, Python or Bun now (they're on supported releases; the new rule covers them going forward); other dependency upgrades not blocked by the Go version; changing the REST or WebSocket contracts; adopting new Go 1.26/1.27 language features beyond what the upgrade needs.
