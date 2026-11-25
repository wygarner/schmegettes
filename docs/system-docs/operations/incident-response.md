# Incident Response

**Source of truth:** `ops/grafana/`, [observability.md](./observability.md), [release-strategy.md](./release-strategy.md)

What to do when an alert email arrives, or a player says something is broken.

## Who is paged

**Wyatt Garner**, by email, for both environments. There is no rotation and no SMS. Routing: [observability.md §5](./observability.md#5-routing).

## Staging or production?

The `env` label is in every alert email's subject (`env=production` or `env=staging`).

- **Production** arrives within a minute of firing. Act on it now.
- **Staging** arrives at most once a day, grouped. Look at it the same day. It usually means the next release has a problem, so fix it before releasing.

## The first five checks

1. **The "tonight" dashboard** (Grafana → Schmegettes → "is tonight's game OK?"), with the alert's environment selected. What changed, and when?
2. **`/healthz`** on api and game for that environment (the URLs are in `HEALTH_TARGETS`). `ok` means the service and its database connection are up; `degraded` means the database is unreachable.
3. **Fly:** `fly status -a <app>` and `fly logs -a <app>` for api and game. Look for restarts, failed health checks, out-of-memory kills, and `ERROR` lines. For a "Live game broken" alert, search the logs for "room crashed" or "phase stuck" to get the `room_id` and `game_id`, then search Grafana's logs for that `room_id` and open the trace from any line's `trace_id`.
4. **The last deploy annotation** on the dashboard. If the problem started at a deploy, roll back (below) before debugging.
5. **Supabase status** (status.supabase.com) and the project's dashboard for that environment: database health, connection count, Auth errors.

## Rolling back

[release-strategy.md, "Rollback"](./release-strategy.md#rollback). A code rollback doesn't undo migrations, which are additive.

## Telling the players

Post an **Incident** notice from the devtools Admin page when players can see the problem (they can't start or join a game, or a game in progress breaks), or when it will last longer than a few minutes. It appears in the app and on the status page. Resolve it when the fix is confirmed. See [Service notices](../../product-docs/features/service-notices/feature-brief.md). For planned maintenance, post a **Maintenance** notice at least 24 hours ahead ([release-strategy.md, "Communication"](./release-strategy.md#communication)).

## After the incident

Write a postmortem for any production incident that players noticed, or that took more than 30 minutes to resolve. Put it in `docs/postmortems/{YYYY-MM-DD}-{short-name}.md` through a PR. Blameless: describe what the system allowed, not who slipped.

```markdown
# {Title}: {YYYY-MM-DD}

**Severity:** players affected / staging only · **Duration:** {start}–{end} ({minutes} min) · **Detected by:** {alert name / player report}

## Summary
Two or three sentences: what broke, who noticed, how it was fixed.

## Timeline (times with zone)
- {time} — first sign (alert, report)
- {time} — investigation started
- {time} — mitigated (rollback, restart, fix)
- {time} — resolved, notice closed

## Impact
Games interrupted, players affected, data lost (if any).

## Cause
What happened, and why it was possible.

## What went well / what didn't
Including: did the alert fire, and how long after the problem started?

## Actions
- [ ] {Change}, tracked as {task or issue}
```
