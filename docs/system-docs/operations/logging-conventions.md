# Logging Conventions

**Source of truth:** `golib/logging/`, `golib/telemetry/`, `golib/db/`, `worker/src/schmegettes_worker/__main__.py`, `api/internal/server/server.go`

Structured JSON logs from every service, written to stdout. `api` and `game` also send every record to Grafana Cloud over OpenTelemetry (OTLP) when an endpoint is configured, with the same fields and levels ([observability.md](./observability.md)). This is the "how" for anyone writing or reviewing a log statement.

## 1. Which logger

| Package | Logger | Notes |
|---|---|---|
| `game` | `log/slog` with `slog.NewJSONHandler` | Base fields `service`, `env` set in `main.go` |
| `api` | Go `log/slog`, JSON handler | One line per request |
| `worker` | `structlog` with `JSONRenderer` | |
| `web` | `console.error` only where a failure is caught, then show it in the UI | Never print tokens or answers in the browser console |

No `fmt.Println` / `puts` / `print` in service code. CLI scripts whose output is the deliverable are the exception.

## 2. Call shape

Static message, variable data as fields:

```go
slog.Error("buzz rejected", "err", err, "room_id", roomID, "user_id", userID)
```
```python
log.info("season imported", season=season, clues=len(clues), duration_ms=elapsed)
```

- Errors go under `err` so the stack and message are kept.
- Never interpolate into the message: `"failed for #{id}"` cannot be filtered by field.
- Log where an error is handled, not at every layer it passes through.
- No per-item logs in loops above `debug`. Log a summary after the loop.

## 3. Levels

| Level | Use |
|---|---|
| `debug` | Diagnostics (off in production) |
| `info` | Lifecycle and state transitions: room created, game started/finished, job completed, ownership handed over |
| `warn` | Recovered or degraded: Redis reconnect, lease lost and retaken, LLM timeout with fallback |
| `error` | An operation failed and a human may need to look |

A wrong answer, a rejected buzz, or a full room is normal gameplay, not an error. Log it at `debug` or not at all.

Gameplay events kept at `info`:

| Message | Fields |
|---|---|
| `voice pick` | `outcome`, `game_id`, `user_id`; picked: `board_clue_id`; missed: `problem`, `heard`, `alternatives`, `categories` |

## 4. Correlation fields

| Field | Where |
|---|---|
| `service`, `env` | every line (set once at startup) |
| `commit` | the startup line. **Not yet implemented** on every line |
| `request_id` | api requests (returned as `x-request-id`); passed to jobs as `requestId` |
| `user_id` | after auth |
| `room_id`, `game_id` | everything in game/, and api/worker code about a room |
| `job_id`, `job_kind` | every worker log line |
| `trace_id`, `span_id` | added by `golib/logging` when the context carries a span: api requests, and game work done for a socket. Use the `…Context` logging calls (`slog.InfoContext(ctx, …)`) so they're found |
| `duration_ms` | completions |

## 5. Never log

- Supabase JWTs, refresh tokens, the `Authorization` header, `Sec-WebSocket-Protocol` (it carries the token), database URLs or passwords, API keys
- Email addresses, passwords (including failed attempts), OAuth profile data
- Whole request/response bodies or whole WebSocket messages
- LLM prompts or completions in full (log the model, token counts, latency, verdict)

Identifiers, counts, statuses, durations, and error types are safe. Players' typed answers may be logged at `debug` only (production runs at `info`, so `debug` lines are neither printed nor exported). The one speech exception is `voice pick` at `info`: a pick contains a category and amount, not an answer, and failed-pick text is retained so matching failures can be measured.

## 6. Security events

Lines that alerts and investigations depend on. Keep the message and fields exactly as listed.

| Level | Message | Fields | Written by | Alert |
|---|---|---|---|---|
| `error` | `audit write failed` | `action`, `sqlstate`, `request_id` | `golib/db` (`logNotice`), from the `WARNING` `private.audit` raises when it can't write a row. The action itself went through | Counted by the "Server errors" rule ([observability.md](./observability.md#4-alert-rules)); a dedicated immediate rule is the `security-audit-and-staff-access` task's |
| `warn` | `staff access granted` | `grant_id`, `subject_type`, `subject_id`, `minutes`, `user_id`, `request_id` | `api/internal/staffaccess` | Email to the admin on every line, both environments (**not yet implemented**) |
| `info` | `staff access read`, `staff access revoked` | `grant_id`, `subject_type`, `subject_id`, `user_id`, `request_id` | `api/internal/staffaccess` | — |
| `error` | `room crashed` | `room_id`, `game_id`, `phase`, `panic`, `stack` | `game/internal/room` (a room's loop panicked; its sockets close with 1011) | "Live game broken", immediate |
| `error` | `phase stuck` | `room_id`, `game_id`, `phase`, `overdue_ms` | `game/internal/room` watchdog, once per phase entry | "Live game broken", immediate |
| `info` | `rate limited` | `group`, `request_id` | `api/internal/ratelimit` | — |
| `info` | `qa accounts marked` | `count`, `request_id` | `api/internal/admin` | — |
| `info` | `qa cleanup` | `dry_run`, `rooms`, `games`, `request_id` | `api/internal/admin` | — |
| `info` | `notice posted`, `notice edited`, `notice resolved` | `notice_id`, `kind`, `revision` | `api/internal/notices` | — |
| `warn` | `status page sync failed` | `notice_id`, `provider_status` | `api/internal/notices` | — |

**The web app (Faro)** reports errors, `console.warn`/`console.error` and named events, never session replays or page text. Its `beforeSend` strips query strings and drops values longer than 500 characters. Event attributes are codes and names (`reason`, `voice`), never player text ([observability.md §9](./observability.md#9-privacy)).

Never logged: a grant's reason (it can contain personal data), what a staff read returned, and the text of other database notices (only their severity and code, at `debug`).
QA operator logs contain counts only: never account IDs, emails, labels, passwords, room IDs, or game IDs.

## 7. Checklist for specs and reviews

- [ ] Uses the service logger
- [ ] `err` field for errors; static message; data in fields
- [ ] Level matches §3 (gameplay outcomes are not errors)
- [ ] `room_id` / `job_id` bound where relevant
- [ ] Nothing from §5; fields are specific values, not whole objects
