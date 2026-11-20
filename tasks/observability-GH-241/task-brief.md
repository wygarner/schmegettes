---
task-type: improvement
task-title: "Know when Schmegettes breaks before the players say so"
---
# Task spec: observability

Product brief: `tasks/observability/product-brief.md`. Decided already: Grafana Cloud over OTLP, Faro in the web app, Grafana Alerting with rules as code, uptime checks from outside Fly, email to Wyatt. The Schmegettes stack is its own free-tier stack, not `celeronsolutions` (Wyatt, 2026-11-19).

## Approach

**Telemetry in the services.** `api` and `game` use the OpenTelemetry Go SDK with OTLP/HTTP export to the stack's OTLP gateway:
- **logs** through the `otelslog` bridge. stdout JSON stays as today, so `fly logs` keeps working.
- **traces** from `otelhttp` on api routes, plus one span per game socket session in `game`;
- **metrics** for the dashboard.

With no exporter configured (local dev and tests), nothing is exported and nothing fails. The web app uses Grafana Faro for errors, Web Vitals and a few custom events, with session replay and page-text capture off.

**Config as code.** Alert rules, contact points, notification policies, dashboards and uptime checks live in `ops/grafana/` as Terraform, using the `grafana/grafana` provider, which covers alerting, dashboards and Synthetic Monitoring. A workflow plans on PRs that touch `ops/grafana/` and applies on merge to `develop`. Terraform is chosen because deleting a rule from the repo then deletes it in Grafana (success criterion), and it needs no custom sync code. State lives in a remote backend (see Decisions needed). Both environments live in one stack, told apart by the `deployment.environment` resource attribute (`staging` | `production`) on every signal. Production alerts go to Wyatt's email right away; staging alerts go to the same contact point through a policy that groups them into one notification a day (`group_interval` 24h), labelled `env=staging`.

**Worker:** no worker process is deployed today. The worker runs only as GitHub Actions jobs (Load Clues, Rate Clues), whose logs GitHub keeps. Telemetry for a deployed worker is deferred to when one exists; `observability.md` says so. That's the only part of the brief's "api, game, and worker" not built here.

## Decisions needed (before implementation starts)

1. **Terraform state backend.** Recommended: an HCP Terraform free workspace, which needs no money and no state on a laptop. Alternative: an S3-compatible bucket in the backup account the `backups-and-restore` task creates, which ties this task to that one. Wyatt picks; the spec assumes HCP Terraform.
2. **Create the stack.** Create the Schmegettes Grafana Cloud stack (free tier) and create, as GitHub Environment secrets on `staging` and `production`:
   - an access-policy token for OTLP write (`OTEL_EXPORTER_OTLP_HEADERS`);
   - a Faro app collector URL (`VITE_FARO_URL`, not secret);
   - a service-account token for Terraform (`GRAFANA_TF_TOKEN`, repo secret);
   - a Synthetic Monitoring token (`GRAFANA_SM_TOKEN`).
   
   An operator does this once; the implementation PR lists the exact names in `configuration-and-secrets.md`.

## Subtasks (narrow → wide)

1. **golib** (`golib/telemetry/`, new):
   - `telemetry.Setup(ctx, service, env, version) (shutdown func(context.Context) error, err)` builds the resource (`service.name`, `service.version` = commit, `deployment.environment`) and installs:
     - the tracer provider, logger provider and meter provider, each with an OTLP/HTTP exporter, only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set;
     - no-ops otherwise.
   - `golib/logging.Setup` gains a fan-out handler: today's stdout JSON handler plus the `otelslog` handler when telemetry is on. Same fields and levels.
   - Trace and span IDs are added to log records when a span is active (`trace_id`, `span_id`), alongside the existing correlation fields (`request_id`, `room_id`, `game_id`, `user_id`).
   - Tests: Setup with no endpoint returns no-op providers and no error. The fan-out handler writes the same record to both sinks (use an in-memory exporter).
2. **api** (`api/cmd/api/main.go`, `api/internal/server/`):
   - Call `telemetry.Setup` at start and shut down on exit, flushing within 5 s.
   - Wrap the router in `otelhttp.NewHandler`, with the route pattern as the span name, never the raw path with IDs.
   - The `Log` middleware puts the span's trace ID on the request log line.
   - Metrics: an `http.server.request.duration` histogram with route and status (from `otelhttp`).
   - Nothing new is logged: no bodies, no tokens.
3. **game** (`game/cmd/game/main.go`, `game/internal/room/`, `game/internal/socket/`):
   - Call `telemetry.Setup` as in api.
   - **Panic containment:** `Room.run` recovers a panic. It logs `ERROR` "room crashed" with `room_id`, `game_id`, `phase` and the stack trace (`stack` attribute; no message payloads), closes the room's sockets with close code 1011, and lets the hub forget the room. One room's bug never takes down the process.
     - The game in progress isn't marked abandoned at once. It follows the existing host-absence path, so a reconnect reloads it from the database (`LoadGame`). Test this.
   - **Stuck-phase watchdog:** each room checks, on a 10 s ticker inside its own loop, whether `now > deadline + 30s` while the phase has a deadline and isn't paused. If so it logs `ERROR` "phase stuck" with `room_id`, `game_id`, `phase` and `overdue_ms`, once per phase entry. Test it with the room's fake clock.
   - **Traces:** a span per socket session (`socket.session`, with attributes `room_id` and `role`), and child spans for `LoadGame` and each store write.
   - **Metrics** (OTel meters):
     - `schmegettes.rooms.open` (gauge, by phase group: lobby/in_game);
     - `schmegettes.sockets.connected` (gauge);
     - `schmegettes.buzz_to_verdict` (histogram, ms, from the winning buzz to `answer_judged`);
     - `schmegettes.judge.verdicts` (counter, by `match_rule` and verdict);
     - `schmegettes.judge.errors` (counter: judge or record failures);
     - `schmegettes.rooms.crashed` and `schmegettes.phase.stuck` (counters).
     
     No user IDs or room codes as metric attributes, to keep cardinality down.
4. **web**:
   - Add `@grafana/faro-web-sdk` (pinned exact) and initialize it in `web/src/main.tsx` only when `VITE_FARO_URL` is set:
     - `app: {name: "schmegettes-web", version: <commit>, environment}`;
     - instrumentations: errors, console (`warn`, `error` only), web-vitals and session.
     - **No session replay, no tracing of fetch bodies**, and a `beforeSend` that drops any `context`/`value` longer than 500 characters and strips URL query strings.
     - The user is not set (no IDs from Supabase), so Faro sees an anonymous session ID only.
   - Custom events: `narrator_line_skipped` from `narrator.ts` wherever it returns `"skipped"` (attributes `reason`, `voice`; never the text), and `socket_reconnect` from `gameSocket.ts`.
   - CSP: `web/scripts/vercel-deploy.mjs` adds the Faro collector origin to `connect-src` for each environment, and `vercel-deploy.test.ts` asserts it.
   - `deploy.yml` passes `VITE_FARO_URL` from the environment's variables at build time.
5. **CI/deploy** (`.github/workflows/`):
   - `deploy.yml`: after "Verify deployed commit", a step posts a Grafana annotation through the HTTP API (`GRAFANA_ANNOTATION_TOKEN`): `tags: [deploy, <env>]`, `text: <commit> <PR title>`. It runs on success and on failure, with `failed` in the tags on failure.
   - It also sets the Fly secrets `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS` from Environment secrets before the deploys, using `fly secrets set --stage`, so the deploy applies them.
   - New `grafana.yml`: `terraform fmt -check` and `terraform plan` on PRs touching `ops/grafana/**`; `terraform apply` on push to `develop` touching it, plus manual dispatch.
   - The deploy-verification failure alert: a Grafana rule on the `deploy` + `failed` annotation is awkward. Instead, `deploy.yml`'s failure path posts directly to the email contact point through the alerting API's test-receiver endpoint. **Simpler and acceptable:** rely on GitHub's failed-workflow email to Wyatt, and document that in `observability.md`. Pick the latter unless it proves unreliable.
6. **ops/grafana** (Terraform, new):
   - `contact_points.tf`: email to Wyatt. The address comes from a TF variable fed by a GitHub secret, never committed.
   - `policies.tf`: route `env=production` to immediate email; route `env=staging` to the same receiver with `group_wait 1h`, `group_interval 24h`.
   - `synthetic.tf`: HTTP checks every 60 s from 2 probes on `https://schmegettes-{api,game}-{env}.fly.dev/healthz` and on the web home page (`https://schmegettes.app/`, `https://staging.schmegettes.app/`).
   - `alerts.tf`, one rule group per environment:
     1. **uptime:** a check failing for 2 consecutive minutes;
     2. **server errors:** the rate of 5xx plus `ERROR` log lines over 10 min above `var.server_error_threshold`. Start at 5 per 10 min, then set it from a week of production baseline and record the number and date in `observability.md`.
     3. **live game broken:** any `schmegettes.rooms.crashed` or `schmegettes.phase.stuck` above 0 in 5 min;
     4. **client errors:** Faro error count over 15 min above `var.client_error_threshold` (start at 20, tune the same way);
     5. **deploy verification failed:** covered by the GitHub email (see subtask 5).
   - `dashboards/tonight.json`, applied by `grafana_dashboard`: rooms and games in progress, sockets connected, buzz-to-verdict p50/p95, judge verdicts and errors, narrator skips (Faro events), client errors, uptime, and deploy annotations. Environment is a variable.
   - **Test alert:** a `grafana_rule_group` "test" with one rule on a constant query that's disabled by default (`is_paused = true`). `observability.md` documents how to fire it per environment: unpause through a one-line TF var, apply, wait, re-pause. Alternatively, use the contact point's "Test" button. Record the date it last reached Wyatt.
   - **Retention:** set and record the stack's log and trace retention, at most 30 days (the `data-retention` task relies on this), in `observability.md`.
7. **docs**:
   - new `docs/system-docs/operations/observability.md`: the stack name and URL; signals and where they come from; metric names; alert rules with thresholds and their dates; routing; the test-alert procedure and the last-tested date; retention; access (Wyatt only); the privacy rules; and the worker note.
   - new `docs/system-docs/operations/incident-response.md`: who is paged; telling staging from production (the label in the email subject); the first five checks (the tonight dashboard, `/healthz` for each app, `fly status`/`fly logs`, the last deploy annotation, Supabase status); rollback (link to `release-strategy.md`); player notices (link to the `service-notices` feature, with "not yet implemented" until it lands); and a postmortem template.
   - `stack.md`: the Grafana rows now say built, with the stack name and URL.
   - `logging-conventions.md`: logs also go to Grafana via OTLP; `trace_id`/`span_id`; the privacy rules for Faro.
   - `release-strategy.md` step 6: point at the dashboard and error rates.
   - `security-model.md`: update the "Telemetry" and "Docs that need hosting first" rows.
   - `configuration-and-secrets.md`: the new variables and secrets.

## Key files

`golib/telemetry/` (new), `golib/logging/logging.go`, `api/cmd/api/main.go`, `api/internal/server/server.go`, `game/cmd/game/main.go`, `game/internal/room/{room,hub}.go`, `game/internal/socket/`, `web/src/main.tsx`, `web/src/lib/{narrator,gameSocket}.ts`, `web/scripts/vercel-deploy.mjs` (+ test), `.github/workflows/{deploy,grafana}.yml`, `ops/grafana/**` (new), and the docs above.

## Contracts preserved

No change to `shared/`, the database, or any message. One new WebSocket behavior: close code 1011 when a room crashes, which the client already treats as a drop and reconnects from. Confirm in `gameSocket.ts`.

## Success criteria

The product brief's criteria. Concretely:
- stopping the staging api machine gives a staging uptime alert within 5 minutes;
- the production test alert reaches Wyatt;
- a forced panic in a staging test room appears with its `room_id` and a trace, fires the live-game alert, and doesn't take down other rooms;
- a thrown web error appears in Faro with the commit and page, and no player text;
- the tonight dashboard shows a full staging game and the last deploy annotation;
- removing a rule from `ops/grafana/` and merging removes it;
- `release-strategy.md` step 6 no longer says "not yet implemented".

For the forced panic: a hook available only when `ENV=staging` and the room code is in `TEST_PANIC_ROOMS` (a staging-only Fly secret), so production can never trigger it. Or do it with a unit test plus a manual staging check; the implementer chooses and documents.

## Test plan

- `mise run test:game -- ./internal/room/...`: panic recovery (the room closes with 1011; the hub keeps serving other rooms; a reconnect reloads the game); the stuck-phase watchdog (fake clock: 29 s over → nothing, 31 s over → one `ERROR`, not repeated).
- `mise run test:api -- ./internal/server/...`: span names use route patterns; the request log carries `trace_id`.
- `go test ./...` in `golib/telemetry` and `golib/logging`: no-op without an endpoint; fan-out.
- `mise run test:web -- src/lib/narrator.test.ts src/main.test.tsx scripts/vercel-deploy.test.ts`: Faro off without `VITE_FARO_URL`; `beforeSend` strips query strings and long values; the skip event carries no text; CSP includes the collector.
- `terraform validate` and `plan` in CI for `ops/grafana/`.
- Manual on staging: the success criteria.

## Database migration plan

None.

## Logging requirements

- New `ERROR` events: "room crashed" (`room_id`, `game_id`, `phase`, `stack`) and "phase stuck" (`room_id`, `game_id`, `phase`, `overdue_ms`).
- Every log line gains `trace_id`/`span_id` when in a span.
- Per `logging-conventions.md` §5, telemetry never carries emails, passwords, JWTs, spoken answers, typed Final answers or page text. Faro's `beforeSend` and the "no replay" setting are reviewed for this.
- Metric attributes never include user IDs or room codes.

## Docs to update

As in subtask 7.
