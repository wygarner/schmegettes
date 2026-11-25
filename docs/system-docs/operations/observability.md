# Observability

**Source of truth:** `golib/telemetry/`, `golib/logging/`, `game/internal/room/telemetry.go`, `game/internal/socket/socket.go`, `api/cmd/api/routes.go`, `web/src/lib/faro.ts`, `scripts/deploy.mjs`, `ops/grafana/`, `.github/workflows/grafana.yml`, `.github/workflows/grafana-check.yml`

How Schmegettes knows it is broken before the players say so: what each service sends to Grafana Cloud, the alert rules and where they go, the "tonight" dashboard, and how to set it all up on a new stack. What to do when an alert arrives: [incident-response.md](./incident-response.md).

## 1. Setting up a stack

Every deployment, including a fork, uses its own dedicated Grafana Cloud stack (free tier is enough). Nothing in the repository names a stack: its URLs and tokens are operator configuration. Until a value is set, the part that needs it stays off and nothing fails: the services export nothing, the web app doesn't load Faro, and deploys skip the annotation.

1. **Grafana Cloud stack.** Create the stack. Note its Grafana URL, its OTLP endpoint and instance ID (Connections → OpenTelemetry), and its Synthetic Monitoring API URL (Testing & synthetics → Synthetics → Config).
2. **Tokens.** Create, in the stack:
   - an access-policy token with `metrics:write`, `logs:write` and `traces:write`, for OTLP. The header value is `Authorization=Basic%20<base64 of instance-id:token>`;
   - a service account with the Editor role and a token, for Terraform;
   - a service account limited to annotations (`annotations:write`), and a token, for the deploy command;
   - a Synthetic Monitoring access token.
3. **Faro.** Create a Frontend Observability app named `schmegettes-web`, one per stack (environments are told apart by `app_environment`). Copy its collector URL.
4. **HCP Terraform.** Create an organization and a workspace for `ops/grafana/` with execution mode **local** (Actions runs plan and apply; HCP Terraform only stores and locks state), and a team or user API token.
5. **GitHub Environment `grafana`.** Create it with deployment branches limited to `develop`, so only the apply job on `develop` can read its secrets.
6. **Secrets and variables.** Set these, and keep the deploy ones in the password manager too ([configuration-and-secrets.md](../security/configuration-and-secrets.md#4-observability-credentials)):

| Name | Kind | Where | Value |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | variable | Environments `staging`, `production` | The stack's OTLP endpoint, e.g. `https://otlp-gateway-….grafana.net/otlp` |
| `OTEL_EXPORTER_OTLP_HEADERS` | secret | Environments `staging`, `production` | `Authorization=Basic%20…` (step 2) |
| `VITE_FARO_URL` | variable (public) | Environments `staging`, `production` | The Faro collector URL (step 3) |
| `GRAFANA_URL` | variable | Environments `staging`, `production`, `grafana` | The stack's Grafana URL |
| `GRAFANA_ANNOTATION_TOKEN` | secret | Environments `staging`, `production` | The annotations-only token |
| `GRAFANA_TF_TOKEN` | secret | Environment `grafana` | The Terraform service-account token |
| `GRAFANA_SM_TOKEN` | secret | Environment `grafana` | The Synthetic Monitoring token |
| `GRAFANA_SM_URL` | variable | Environment `grafana` | The Synthetic Monitoring API URL |
| `TF_API_TOKEN` | secret | Environment `grafana` | The HCP Terraform API token |
| `TF_CLOUD_ORGANIZATION`, `TF_WORKSPACE` | variables | Environment `grafana` | The HCP Terraform organization and workspace |
| `ALERT_EMAIL` | secret | Environment `grafana` | Where alerts go. Never committed |
| `HEALTH_TARGETS` | variable | Environment `grafana` | JSON: `{"production": {"api": "https://…/healthz", "game": "https://…/healthz", "web": "https://…/"}, "staging": {…}}` |

7. **Apply.** Run the **Grafana apply** workflow on `develop` (or merge any change under `ops/grafana/`). Then deploy each environment, which stages the OTLP secrets on the Fly apps and builds the web app with Faro.
8. **Check.** Fire the test alert for each environment (section 6) and record the date.

## 2. Signals

Every signal carries the resource attributes `service.name` (`api`, `game`, `schmegettes-web`), `service.version` (the commit) and `deployment.environment` (`staging` or `production`). In Grafana Cloud they become the labels `service_name` and `deployment_environment` (logs, metrics) and `app_environment` (Faro).

| Source | Signal | How |
|---|---|---|
| api, game | Logs | `golib/logging` writes every record to stdout as JSON (so `fly logs` still works) and to OTLP through the `otelslog` bridge. Inside a span, lines carry `trace_id` and `span_id` |
| api | Traces | `otelhttp` around the router: one span per request, named by route pattern (`GET /v1/rooms/{roomId}`), never the raw path |
| api | Metrics | `http.server.request.duration` (from `otelhttp`), by `http.route` and status |
| game | Traces | `socket.session` per WebSocket (attributes `room_id`, `role`), and a child span per store call (`store.LoadGame`, `store.RecordAnswer`, …) made for that socket's events. Store calls made by a timer are their own traces |
| game | Metrics | Below |
| web | Faro | Errors, `console.warn`/`console.error`, Web Vitals and an anonymous session id. Custom events below. No session replay, no fetch tracing, no user |
| deploys | Annotations | Tags `deploy`, the environment and the scope (plus `failed` and `failed:<step>` on a failed deploy); text: short SHA and commit subject |
| Synthetic Monitoring | Uptime | `probe_success` per check: each environment's api and game `/healthz` and the web home page, every 60 s from two probes. Jobs are `schmegettes-<env>-<component>` |

**Worker.** No worker process is deployed: the worker runs only as GitHub Actions jobs (Load Clues, Rate Clues), whose logs GitHub keeps. It exports no telemetry. When a worker is deployed, it gets the same OTLP setup.

### Game metrics

No metric attribute carries a user id or room code.

| Metric (Prometheus name) | Type | Attributes | Meaning |
|---|---|---|---|
| `schmegettes_rooms_open` | gauge | `phase_group` (`lobby`, `in_game`) | Rooms running on the instance |
| `schmegettes_sockets_connected` | gauge | | Open game sockets |
| `schmegettes_buzz_to_verdict_milliseconds` | histogram | | From the winning buzz to the judged answer |
| `schmegettes_judge_verdicts_total` | counter | `match_rule`, `verdict` | Judged answers |
| `schmegettes_judge_errors_total` | counter | `op` | Failed writes of judged answers and other game records |
| `schmegettes_rooms_crashed_total` | counter | | Room loops that panicked |
| `schmegettes_phase_stuck_total` | counter | | Phases that outlived their deadline by more than 30 s |

### Web events (Faro)

| Event | Attributes | Sent when |
|---|---|---|
| `narrator_line_skipped` | `reason` (`voice_not_ready`, `no_audio_context`, `start_timeout`, `synthesis_failed`, `chunk_failed`), `voice` | The host device's narrator skips a line. Never the line's text |
| `socket_reconnect` | `reason` (`drop`, `seq_gap`), `closeCode` | The game socket reconnects |

### Containment in the game server

- **Room crash.** A panic in a room's loop is recovered: the room logs `ERROR` "room crashed" (`room_id`, `game_id`, `phase`, `stack`; never message payloads), closes its sockets with code 1011, and the hub forgets it. Other rooms keep running. The game isn't ended: a reconnecting client starts a fresh room that reloads the game from the database, and if nobody comes back the host-absence rule ends it as usual.
- **Stuck phase.** Every 10 s each room checks whether the phase's deadline passed more than 30 s ago (while not paused). If so it logs `ERROR` "phase stuck" (`room_id`, `game_id`, `phase`, `overdue_ms`), once per phase entry.
- **Forced panic (staging only).** To check the alert path end to end, set the Fly secret `TEST_PANIC_ROOMS` on the staging game app to a comma-separated list of room IDs. Any `select_clue` in a listed room panics. It is ignored unless `APP_ENV` is `staging`. Unset it afterwards: `fly secrets unset TEST_PANIC_ROOMS -a <staging game app>`.

## 3. Config as code

`ops/grafana/` is Terraform (`grafana/grafana` provider): the contact point, notification policies, alert rules, the "tonight" dashboard and the uptime checks. Nothing is edited by hand in the Grafana UI: a hand edit is overwritten by the next apply, and deleting something from the repo deletes it in Grafana.

- **Pull requests** that touch `ops/grafana/` run `grafana-check.yml`: `terraform fmt -check` and `terraform validate` with no backend and no credentials, safe for fork PRs. There is no plan on a PR, because a plan needs a Grafana token and a PR job must not hold one ([security-model.md](../security/security-model.md#7-public-repository)).
- **Merge to `develop`** runs `grafana.yml` in the protected `grafana` environment: it plans, prints the plan in the run log, then applies. Runs never overlap.
- **Locally:** `cd ops/grafana && mise exec terraform@1.17.2 -- terraform fmt -recursive && mise exec terraform@1.17.2 -- terraform init -backend=false && mise exec terraform@1.17.2 -- terraform validate`.

## 4. Alert rules

One rule group per environment (`schmegettes-staging`, `schmegettes-production`) in the "Schmegettes" folder, each rule labelled `env` and `kind`.

| Rule | Fires when | Threshold (set) |
|---|---|---|
| Uptime check failing | A check fails from every probe for 2 minutes (or reports nothing) | — |
| Server errors | 5xx responses plus `ERROR` log lines from api and game in 10 minutes exceed `server_error_threshold` | 5 (2026-11-25, starting value) |
| Live game broken | Any room crash or stuck phase in 5 minutes | > 0 |
| Client errors | Faro exceptions in 15 minutes exceed `client_error_threshold` | 20 (2026-11-25, starting value) |
| Deploy verification failed | Not a Grafana rule: GitHub emails the failed deploy workflow to Wyatt, and the deploy command writes a `failed` annotation. A deploy run by hand shows the failure in the operator's terminal | — |

**Tuning.** After a week of production traffic, set both thresholds from the baseline (in `ops/grafana/variables.tf`) and update the table with the number and date.

## 5. Routing

One contact point, email to `ALERT_EMAIL` (Wyatt Garner). The email subject carries the `env` label.

| Route | Matcher | Grouping |
|---|---|---|
| Production | `env=production` | Sent within 30 s, regrouped every 5 minutes, repeated every 4 hours while firing |
| Staging | `env=staging` | Grouped into at most one email a day (`group_wait` 1 h, `group_interval` 24 h) |

## 6. Test alert

Each environment has a paused test rule ("Test alert (staging)", "Test alert (production)") on a constant that always fires.

1. Run **Grafana apply** on `develop` with `test_alert` = `production` (or `staging`).
2. Wait for the email (production: about a minute; staging: up to an hour, because of grouping).
3. Run **Grafana apply** again with `test_alert` = `none` to pause it.
4. Record the date below.

The contact point's **Test** button in Grafana (Alerting → Contact points) checks the email delivery alone.

| Environment | Last reached Wyatt |
|---|---|
| production | not yet tested |
| staging | not yet tested |

## 7. Dashboard: "is tonight's game OK?"

"Schmegettes: is tonight's game OK?" (`ops/grafana/dashboards/tonight.json`), with an environment picker and deploy annotations: rooms open by phase group, sockets connected, uptime checks, buzz-to-verdict p50/p95, judge verdicts, judge and record errors, room crashes and stuck phases, narrator skips (host device), client errors, api 5xx and server `ERROR` lines, and api p95 latency per route.

## 8. Retention and access

- **Retention:** the free tier's 14 days for logs, traces, metrics and Faro data (recorded 2026-11-25; within the 30-day limit in [data-retention.md](./data-retention.md)). The free tier doesn't let the stack change it. A paid plan's default is longer: check it, and set it to at most 30 days, before upgrading.
- **Access:** Wyatt Garner only. The stack has no other users; tokens are scoped as in section 1.

## 9. Privacy

[logging-conventions.md §5](./logging-conventions.md#5-never-log) applies to every signal. In addition:

- Telemetry never carries emails, passwords, JWTs, spoken answers or typed Final answers (players' answers stay at `debug`, which isn't exported at the default `info` level), or page text.
- Faro: no session replay, no fetch or XHR tracing, no user set (an anonymous session id only). Its `beforeSend` strips query strings and fragments from every URL and drops any value longer than 500 characters.
- Metric attributes never include user ids or room codes. Spans carry `room_id` (an id, allowed), never names or answers.
