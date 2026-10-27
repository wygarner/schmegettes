---
jira-type: improvement
jira-title: "Scaffold api, game, and worker on the pinned toolchains"
---

**Task Type:** Improvement

**Problem:** The bootstrap created `game/` and `worker/` by hand and left `api/` ungenerated, because Go, Python 3.13, uv, and the Supabase CLI were not installed on the bootstrap machine. CI skips `api` and `worker` until their lockfiles exist, and the `shared` job's generated-code check fails until Go and Python contract code is committed.

**Outcomes:**

- `api/` (Go) builds and passes `gofmt`, `go vet`, `staticcheck`, and `go test -race`, and gets JWT verification and the `db.AsUser` helper per `api/SETUP.md` (shared with `game/` through `golib/`)
- `game/` compiles with Go 1.25, passes `gofmt`, `go vet`, `staticcheck`, and `go test -race`
- `worker/` has a committed `uv.lock` and passes `ruff`, `mypy --strict`, and `pytest`
- `mise run gen` produces Go and Python contract code, committed
- `mise.toml` pins exact patch versions (`mise use --pin`)
- `supabase db start` + `supabase test db` pass locally with the real Supabase stack

**Success Criteria:** the first daily PR into `develop` is green on every CI job, and none is skipped for a missing lockfile.

**Why this task first:** it is small and has no product risk, so it is the bootstrap guide's end-to-end check of the Jira automation: product brief → task spec (ticket created, folder renamed) → implementation (In Review → Done) → daily close.

**Out of scope:** any gameplay; choosing hosting.
