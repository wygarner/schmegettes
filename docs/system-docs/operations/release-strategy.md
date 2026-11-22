# Release Strategy

**Source of truth:** `scripts/release-scope.cjs`, `.github/workflows/deploy-prod.yml`

## Versioning

Strict semver. **Major**: breaking or significant. **Minor**: backwards-compatible additions. **Patch**: fixes only (every hotfix).

## Flow

```text
develop → releases/X.Y.Z → production
```

`develop` is never merged straight into `production`. Never cut a release from a red `develop`. Commits pushed straight to `develop` get no CI run (there is no push trigger), so dispatch `ci.yml` on `develop` first if any exist.

## Scope

```bash
git fetch origin
node scripts/release-scope.cjs origin/production origin/develop
```

The script reads commit bodies and PR descriptions as well as subjects (the three squashed daily PRs from before 2026-11-18 name no ticket in their subjects). Its output has three parts: **Implemented** (with task type, which sets the bump; tickets marked "already on origin/production" shipped in a hotfix and are excluded), **Task spec or docs only** (not in the release), and **Named without a type** (check by hand).

## Process

1. **Cut the branch** from `develop`, then merge `origin/production` into it straight away, so hotfixes already on production don't conflict at merge time:
   ```bash
   git checkout -b releases/X.Y.Z origin/develop
   git merge origin/production
   mkdir -p releases/X.Y.Z
   ```
2. **Write the four docs** in `releases/X.Y.Z/`: `metadata.md` (`released: false`, blank `release-date`), `tickets.md` (grouped by type), `user-release-notes.md`, `internal-release-notes.md` (migrations, config changes, breaking changes). Open the PR to `production`, titled `[Release] X.Y.Z`.
3. **Verify:** CI green; migrations rehearsed on staging; the end-to-end suite passes against staging (`gh workflow run e2e.yml`; a failure blocks the release like red CI; [testing-strategy.md](../engineering/testing-strategy.md#6-end-to-end)); then agent QA runs on staging per [agent-qa.md](../quality/agent-qa.md) and its evidence is recorded in the release's internal notes. A person checks anything in the human checklist affected by the release. Merge `origin/production` in again right before merging.
4. **Human approves. Merge as a merge commit** (`gh pr merge --merge`). `deploy-prod.yml` runs.
5. **Confirm `deploy-prod.yml` passed for the merge commit**, including the deployed-commit check:
   ```bash
   gh run list --workflow deploy-prod.yml --commit "$(git rev-parse origin/production)"
   ```
   No run listed → dispatch it: `gh workflow run deploy-prod.yml --ref production`.
6. **Confirm production health:** Grafana dashboards and error rates since the deploy (**not yet implemented**, see [stack.md](../engineering/stack.md)), and a production smoke with QA accounts strictly within [the production rules](../quality/agent-qa.md#production-rules). Until Grafana is set up, health also requires `/healthz` on `api` and `game` and the worker process running.
7. **Only then** open a sign-off PR to `production` setting `released: true` and `release-date: YYYY-MM-DD` in `metadata.md`; merge as a merge commit.
8. **Post What's new** from the production devtools Admin page, using the signed-off `user-release-notes.md` as the source. Preview it, post once, and confirm it appears on Home.

The gap between "code is live" and "marked released" is deliberate: a human confirms production health before anyone is told the release shipped.

`releases/X.Y.Z/` stays on `production` permanently. Releases have no tracking issue.

## Hotfix

1. Branch `hotfix/X.Y.Z-description` from `production`. When possible, land the fix on `develop` first and cherry-pick it; test the cherry-pick before promising a hotfix, because production may be far behind `develop`.
2. PR to `production` (merge commit), deploy, verify as in steps 5–6, sign off.
3. Backport to `develop` (a PR into `develop` like any task).
4. `releases/X.Y.Z/` with `tickets.md`, `metadata.md`, `internal-release-notes.md` (user notes only if user-visible).

## Rollback

Each deploy labels its Fly images with the commit, and Vercel keeps every deployment, so a rollback names the last good commit or deployment. Run Fly commands from the repo root with the pinned `flyctl` (`mise install`); use the `-staging` names to practise on staging.

| Component | Command |
|---|---|
| web | Vercel dashboard → `schmegettes-web-prod` → Deployments → the last good production deployment → **Instant Rollback** |
| api | `fly releases -a schmegettes-api-prod --image` to find the last good image, then `fly deploy . -c api/fly.toml -a schmegettes-api-prod --image registry.fly.io/schmegettes-api-prod:{commit}` |
| game | `fly releases -a schmegettes-game-prod --image`, then `fly deploy . -c game/fly.toml -a schmegettes-game-prod --ha=false --image registry.fly.io/schmegettes-game-prod:{commit}` |
| worker | None: no worker process is deployed |

A rollback is not a commit on `production`, so the next push to `production` deploys over it. Fix forward with a hotfix.

Code rollbacks do not undo migrations. Because migrations are additive (see [data-and-isolation.md](../architecture/data-and-isolation.md)), rolling code back over a new migration is normally safe; evaluate each case. After a rollback, reopen the affected tickets and record the reason in the internal release notes.

## Communication

Players are anonymous by default, so there is no email list: players hear about releases and incidents through in-app notices, plus the externally hosted Instatus page. There is no separate support or internal team, so the guide's "Support" and "Internal team" rows don't apply.

| Event | Audience | Channel | Timing | Owner |
|---|---|---|---|---|
| Release | Players | `user-release-notes.md`, posted as What's new in devtools | After sign-off (Process step 8) | Wyatt Garner |
| Planned maintenance or downtime | Players | Devtools Maintenance notice; synchronized to Instatus | At least 24 hours ahead | Wyatt Garner |
| Incident players notice | Affected players | Devtools Incident notice; synchronized to Instatus | A first notice once the incident is confirmed, then an update every 6 hours until resolved, then a resolution notice | Wyatt Garner |
| Security or privacy incident | Affected players, and regulators where required | As the law requires | Within the legal deadline | Wyatt Garner |

Every message:

- says what is affected, what the player should do, and when the next update comes
- never includes another player's data
- after a postmortem, is followed by a short note to the players who noticed the incident
