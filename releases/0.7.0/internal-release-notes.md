# 0.7.0 internal notes

## Before merging
- **CI:** green on every PR in this release; all 34 commits since 0.6.0 came through PRs.
- **Staging rehearsal:** Deploy Staging has run on `develop` since #291 merged, most recently at `9291393` (2026-11-25, passed), so the migration below is applied on staging.
- **End-to-end on staging:** passed, run 45695000570 (2026-11-25); details below.
- **Agent QA on staging:** service notices (#291) and the web changes in #318 (Faro, socket reconnect, narrator). Evidence recorded below.
- **Production values to set first:**
  - `STATUS_PAGE_API_TOKEN` and `STATUS_PAGE_ID` as Fly secrets on the production api, and `VITE_STATUS_URL` in the `production` environment (#291). Without them, notices work in the app but don't sync to Instatus.
  - `GRAFANA_ANNOTATION_TOKEN`: the first token returned 401. It was replaced with a service-account token in `staging` and `production` on 2026-11-25, and a staging deploy (run 45705065001) wrote its annotation.

## Migrations
One, additive:
1. `20261122173952_service_notices` (#291): notice tables with RLS, admin functions, history and audit events; pgTAP `service_notices.test.sql`. Compatible with the code already running: new tables and functions only.

## Contracts
Additive: the notice REST routes (#291), and `contracts_gen.go` regenerated with oapi-codegen v2.9.0 (#313; the generated Go names of the room-join role constants changed, which is internal). No WebSocket message changes. New behavior: the game server closes a crashed room's sockets with code 1011, which the client already treats as a drop and reconnects from (#318).

## Config changes
- **Deploys** run `scripts/deploy.mjs` (#301). They need `WEB_VERSION_URL`, `API_VERSION_URL` and `GAME_VERSION_URL` in each environment (set).
- **Telemetry** (#318), optional, each skipped when unset: `OTEL_EXPORTER_OTLP_ENDPOINT`/`HEADERS` (staged as Fly secrets by the deploy), `VITE_FARO_URL` (web build and CSP), `GRAFANA_URL`/`GRAFANA_ANNOTATION_TOKEN` (deploy annotation). All set in `production`.
- **Grafana config** is applied from `develop` by `grafana.yml`, not by this release: alert rules, uptime checks and the dashboard already cover production. Terraform state is in the staging Supabase project's Storage.
- **Go 1.27.4** images (#313). New web dependency: `@grafana/faro-web-sdk` 2.15.0 (Apache-2.0).

## Verification
- **E2E (staging):** passed on 2026-11-25, run 45695000570, critical path in 4.8 min. It was the suite's first run on staging. The first run (45677299765) failed at sign-in: the E2E host account wasn't set up yet. Two more (45683075776, 45684006780) failed waiting for a Daily Double answer. The test gave up 20 s after the wager, before the clue had been read; the game accepted the wager and timed the answer out normally. Fixed in the test only (#320, merged into this release from `develop`).
- **Agent QA (staging):** pending.

## After deploy
- **Production health** (release-strategy.md step 6), for the first time on the Grafana dashboard: uptime checks green, no new server errors, client errors, room crashes or stuck phases since the deploy annotation, no production alert firing. Then the QA-account smoke.
- **Production health confirmed by Wyatt:** pending (the sign-off merges only after it).
- **Post What's new** from the production Admin page using `user-release-notes.md` (release-strategy.md step 8). This is the first release with the notices feature live.
