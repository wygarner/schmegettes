# Logging Conventions

Structured JSON logs from every service, shipped to Grafana Cloud over OpenTelemetry. This is the "how" for anyone writing or reviewing a log statement.

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

## 4. Correlation fields

| Field | Where |
|---|---|
| `service`, `env`, `commit` | every line (set once at startup) |
| `request_id` | api requests (returned as `x-request-id`); passed to jobs as `requestId` |
| `user_id` | after auth |
| `room_id`, `game_id` | everything in game/, and api/worker code about a room |
| `job_id`, `job_kind` | every worker log line |
| `trace_id`, `span_id` | added by OpenTelemetry when a span is active |
| `duration_ms` | completions |

## 5. Never log

- Supabase JWTs, refresh tokens, the `Authorization` header, `Sec-WebSocket-Protocol` (it carries the token), database URLs or passwords, API keys
- Email addresses, OAuth profile data
- Whole request/response bodies or whole WebSocket messages
- LLM prompts or completions in full (log the model, token counts, latency, verdict)

Identifiers, counts, statuses, durations, and error types are safe. Players' typed answers may be logged at `debug` only.

## 6. Checklist for specs and reviews

- [ ] Uses the service logger
- [ ] `err` field for errors; static message; data in fields
- [ ] Level matches §3 (gameplay outcomes are not errors)
- [ ] `room_id` / `job_id` bound where relevant
- [ ] Nothing from §5; fields are specific values, not whole objects
