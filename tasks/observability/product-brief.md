---
jira-type: improvement
jira-title: "Know when Schmegettes breaks before the players say so"
---
**Task Type:** Improvement. No player-facing UI change. Players only notice it through faster fixes.

**Product docs:** No durable product-doc change. New system docs: `docs/system-docs/operations/observability.md` and `docs/system-docs/operations/incident-response.md`. Update [stack.md](../../docs/system-docs/engineering/stack.md), [logging-conventions.md](../../docs/system-docs/operations/logging-conventions.md), [release-strategy.md](../../docs/system-docs/operations/release-strategy.md) step 6, and the "Telemetry" and "Docs that need hosting first" rows in [security-model.md](../../docs/system-docs/security/security-model.md).

**Problem:** Schmegettes is played on game nights: a group in one room for an hour or two, every few weeks. When something breaks there, the evening is ruined, and the first anyone hears of it is a text the next day, if at all. Today:

- Logs go to stdout on Fly and nowhere else. Fly keeps a short window, so last Friday's failure is unrecoverable.
- Nothing watches `/healthz` from outside. Staging was down for most of 2026-11-19 (see the `staging-down` task) and no one was told.
- The web app reports nothing. A crash on a contestant's phone or the narrator failing on the host device is invisible.
- There is no way to line a spike up with a deploy.

Everything is already decided in [stack.md](../../docs/system-docs/engineering/stack.md): Grafana Cloud over OTLP for logs, traces, and metrics; Grafana Faro in the web app; Grafana Alerting with rules as code; an uptime check on each public `/healthz` from outside Fly; email to Wyatt Garner. None of it is built.

**Outcomes:**
- **Wyatt hears first.** An email reaches him within 5 minutes of any of these, in production:
  1. `api` or `game` `/healthz` fails from outside for 2 consecutive minutes, or the web app's home page stops loading.
  2. Server errors (5xx, or `ERROR` log lines) on `api` or `game` exceed a threshold engineering sets from a week of baseline.
  3. A live game breaks: the game server logs a room crash, panic, or stuck phase (a phase that outlives its own timer by more than 30 s).
  4. Client errors from the web app (Faro) spike above baseline, so a broken release on phones is caught even when the servers look fine.
  5. A deploy's verification step fails.
  Staging alerts too, but on a separate, lower-priority route (a daily summary or a separate label) so it doesn't train him to ignore production.
- **Every failure can be traced after the fact.** Logs from `api`, `game`, and `worker`, traces for api requests and game socket sessions, and web errors land in Grafana Cloud, joined by request ID, room ID, and game ID, and kept for at least the plan's retention (record the exact number in observability.md).
- **One dashboard answers "is tonight's game OK?"** It shows rooms and games in progress, connected sockets, buzz-to-verdict latency, judge error rate, narrator line skips (from the host device via Faro), client errors, and deploy markers.
- **Deploy markers.** Every staging and production deploy writes an annotation with the commit, so a spike can be tied to a release.
- **Rules are code.** Alert rules, contact points, and dashboards live in the repo and are applied by CI, not edited by hand in the UI.
- **The alert path is tested.** Each environment has a way to fire a test alert, and observability.md records the date it last reached Wyatt.
- **Incident response is written down.** incident-response.md: who is paged (Wyatt), how to tell a staging alert from a production one, the first five things to check, how to roll back (link to release-strategy.md), when to post a player notice (it links to the planned service-notices feature until that exists), and the postmortem template.

**Privacy rules (from [logging-conventions.md](../../docs/system-docs/operations/logging-conventions.md) and [accounts](../../docs/product-docs/features/accounts/feature-brief.md)):** no email addresses, passwords, JWTs, spoken answers, or typed Final answers in telemetry. User IDs and room codes are allowed. Faro must not record session replays or page text. Access stays Wyatt-only.

**Success Criteria:**
- Stopping the staging `api` machine produces a staging alert within 5 minutes; a test alert on the production route reaches Wyatt's email.
- A deliberate error in a staging game (a forced panic in a test room) shows up in Grafana with its room ID and a trace, and fires the live-game alert.
- A thrown error in the staging web app appears in Faro with release (commit) and page, and no player text.
- The "tonight's game" dashboard shows a full staging game played end to end, with a deploy marker from the most recent deploy.
- Removing an alert rule from the repo and merging removes it from Grafana.
- release-strategy.md step 6 points at the dashboard and error rates instead of "not yet implemented".

**Decision needed:** The Grafana Cloud stack connected today is `celeronsolutions`, which belongs to a different business. Recommended: **a separate free-tier Schmegettes stack**, so access, retention, and billing stay separate and the repo can go public without exposing another business's stack. The alternative is to reuse that stack with a `service_namespace=schmegettes` label, which is cheaper to set up but mixes the two businesses' data and access.

**Out of scope:** A paging app or SMS (email only, as decided), on-call rotation (one person), the customer-facing status page and in-app notices (the `service-notices` task), backups (the `backups-and-restore` task), the security audit table and its alerts (the `security-audit-and-staff-access` task), Redis or worker queue metrics (neither exists yet), and LLM eval telemetry.
