# Realtime Game Server (`game/`)

## Principles

- **Server-authoritative.** Clients send intents (`buzz`, `select_clue`, `submit_answer`). The server decides what happened and broadcasts the result. The prototype let clients run timers and add their own score; that is not allowed here.
- **One owner per room.** Exactly one instance runs a room's state machine at a time.
- **Fan-out through Redis.** Any instance can hold a player's socket. Every event is published to `room:{id}` and relayed to local sockets, so the server scales horizontally.
- **Recoverable.** On every phase change the owner writes a snapshot to Redis (`room:{id}:snapshot`). A new owner resumes from it.

## Connecting

`GET /rooms/{roomId}/ws` with subprotocols `["schmegettes.v1", "bearer.{jwt}"]`. Browsers can't set headers on a WebSocket, so the token travels as a subprotocol. The server:

1. verifies the JWT against the Supabase JWKS and checks room membership (as the user, through RLS)
2. accepts with subprotocol `schmegettes.v1` only (the token is never echoed back)
3. sends a `room_snapshot`, then live events

Proxies may log `Sec-WebSocket-Protocol`. If the chosen host does, switch to a short-lived single-use ticket from the API (`POST /v1/rooms/{id}/ticket`), and update this doc and `web/src/lib/gameSocket.ts`.

## Room ownership

- The owner holds `room:{id}:owner` in Redis (`SET NX PX 10000`, renewed every 3 s).
- Intents arriving at a non-owner instance are forwarded on `room:{id}:intents`.
- If the lease expires (crash, deploy), the next instance to receive an intent takes it over, loads the snapshot, and continues. Timers restart from the snapshot's `deadlineAt`.
- On SIGTERM an instance releases its leases after a final snapshot, so a deploy hands rooms over within a second.

## Buzzing

- Buzzing opens when the host (or the read timer) moves the clue to `buzzing_open`.
- A buzz before that earns a lockout (`buzz_result: locked_out`, 250 ms), as on the show.
- The first buzz the owner *receives* after opening wins. `clientSentAt` is logged for latency analysis but never trusted for ordering.

## Messages

Defined in `shared/schemas/protocol/`. Every server message carries `roomId` and `seq` (+1 per room event). A client that sees a gap reconnects and gets a fresh snapshot. The correct response is sent only in `answer_judged`, never with a board clue.

## Judging

`internal/judge` normalizes both strings (case, punctuation, "What is", articles, parenthetical hints) and allows one edit per five characters. The host can override any verdict (`override_verdict`). Disputes can be appealed to the worker (`appeal_answer` job).
