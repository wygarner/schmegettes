---
task-type: improvement
task-title: "Deploy and roll back without depending on GitHub Actions"
---
**Task Type:** Improvement. This changes engineering operations, not player-facing behavior.

**Product docs:** No durable player-product documentation changes. Update the system documentation that describes deployment, release, secrets, and operator commands:

- `docs/system-docs/operations/deployment.md`
- `docs/system-docs/operations/release-strategy.md`
- `docs/system-docs/operations/operator-scripts.md`
- `docs/system-docs/security/configuration-and-secrets.md`
- `docs/system-docs/engineering/stack.md` where it names the deploy source of truth

**Revision (Wyatt Garner, 2026-11-23): resilience only.** The 2026-11-22 "quiet `develop`" decision was driven by Actions budget. The repository is going public, so GitHub-hosted runners stop costing budget, and that decision is withdrawn. Merging to `develop` keeps deploying staging automatically. Weekly CI and the existing manual workflow runs stay. What remains is the part that is still true on a public repo: deployment logic lives in workflow YAML, so an Actions outage, a disabled workflow, or a broken runner blocks every deploy and rollback, even though Fly.io, Vercel, and Supabase are all reachable.

**Problem:** The only complete deploy path for staging and production is the multi-job shell in `.github/workflows/deploy.yml`. An operator has no supported way to run the same migrations → api → game → web → version-check sequence. They can't redeploy one component on its own, and they can't do either when Actions can't start. Each recovery so far has meant copying platform commands by hand, and those copies can skip a step such as migrations, `--ha=false`, or the SHA check.

**Considered options:**

1. **One repo-owned deploy command; workflows call it (selected).** The existing triggers don't change. The deploy logic moves out of YAML into a tested command that Actions and an operator both run.
2. **Document the manual platform commands only.** Cheapest to build, but then two deploy paths exist that drift apart, and nothing enforces ordering or SHA verification.
3. **Quiet `develop` + operator-only staging (the withdrawn 2026-11-22 version).** No longer justified once runners are free. It would also stop staging from tracking `develop`.

**Outcomes:**

- **One deploy implementation.** A single repo command family deploys `staging` or `production`, as a full environment or as one component (`api`, `game`, `web`), and runs migrations as an explicit operation. The staging and production workflows become thin callers of this command, with no second copy of migration, Fly, web-build, or version-check logic in YAML.
- **Triggers are unchanged.** A merge to `develop` still deploys staging automatically. A merge to `production` still deploys production automatically. CI triggers (PR, weekly schedule, manual) are untouched.
- **Zero-Actions fallback.** From a clean checkout of the intended commit, an authorized operator can run the same full or component deploy with Actions disabled or unavailable. It needs no workflow dispatch and no new commit.
- **The deploy contract does not weaken.** A full deploy:
  1. confirms the checkout is clean, belongs to the right branch, and records its full SHA;
  2. applies additive migrations before any new code receives traffic;
  3. builds each component from that SHA;
  4. waits for platform health checks;
  5. confirms that every `/version` endpoint (and web `/version.json`) reports that SHA; and
  6. exits nonzero at the first failure, naming what deployed and what didn't.
- **A component deploy is safe and honest.** It deploys and verifies only the named component, never runs migrations implicitly, and says plainly when the environment is now on mixed SHAs.
- **The command is hard to misuse.** It validates configuration and provenance before changing anything. It has a preflight (no-change) mode and prints the environment, scope, and SHA before acting. Production runs only from the current `production` tip, and staging only from a commit reachable from `develop`.
- **Secrets exist outside GitHub.** The operator has a documented secure source for every deploy credential and build-time value. The command takes them from the process environment at runtime and never commits them, writes them to `.env` files, or prints them. GitHub Environments stay the source for the workflows.
- **Rollback without Actions.** Rollback of web, api, and game is documented with pinned tools, explicit environment names, and a version check afterward. Database rollback stays out of scope (migrations are additive and forward-only).

**Failure rules:**

- A failed preflight changes nothing.
- A failed migration stops the deploy before any service deploy starts.
- A partial failure names the components that deployed, failed, or never started, plus the rollback reference. It never reports success.
- A wrong or missing version response is a failed deploy even if the platform reported success.
- An Actions outage may block new PR checks and the automatic deploys, but it never blocks an operator deploying or rolling back an already-validated commit.
- Losing GitHub entirely is out of scope. The operator still needs a local checkout.

**Success Criteria:**

- Merging a code PR to `develop` still deploys staging automatically, now through the shared command, and verifies the merge SHA.
- Merging a release PR to `production` still deploys production automatically through the same command.
- With Actions unavailable, an operator completes a full staging deploy from a clean `develop` commit: migrations, api, game, web, health checks, and all three SHA checks.
- With Actions unavailable, an operator completes the same production deploy only from the current `production` tip. Preflight rejects any other commit.
- Each of web, api, and game can be deployed and version-verified alone, with mixed-SHA state reported.
- Preflight with one missing credential fails before any external change, and its output contains no secret.
- A deliberately failing migration blocks all service deploys. A wrong version response fails the deploy.
- Rollback of web, api, and game is exercised in staging without Actions.
- No workflow YAML keeps its own migration, Fly, Vercel, or version-check implementation.

**Out of scope:** Changing any workflow trigger (including weekly CI and staging deploy-on-merge); replacing GitHub Actions; changing the `develop` → release → `production` model; changing hosting providers; deploying the not-yet-hosted worker or devtools; changing the migration or rollback policies; public-repository hardening, which is its own task (`public-repo-hardening`); and any player-visible change.
