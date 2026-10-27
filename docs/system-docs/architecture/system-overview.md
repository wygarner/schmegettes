# System Overview

```mermaid
flowchart LR
  subgraph Browser
    web[web/ React]
  end
  web -- "auth (anonymous / Google)" --> sbauth[Supabase Auth]
  web -- "REST + JWT" --> api[api/ Rails]
  web -- "WebSocket + JWT" --> game[game/ Go]
  api -- "as user (RLS)" --> db[(Supabase Postgres)]
  game -- "game_engine role" --> db
  game <-- "pub/sub per room" --> redis[(Redis)]
  api -- "pgmq.send" --> db
  worker[worker/ Python] -- "pgmq.read" --> db
  worker -- "appeal judging" --> llm[LLM API]
```

## A game, end to end

1. **Sign in.** The web client signs in anonymously with Supabase Auth on first visit. The JWT goes with every REST call and the socket connect.
2. **Create a room.** `POST /v1/rooms` (Rails) inserts the room. A trigger makes the caller its host. Rails enqueues `build_board` in the same transaction.
3. **Build the board.** The worker picks a season's categories from the clue catalog and writes `board_clues` (category, value, position, catalog reference; never clue text or the response).
4. **Join.** Players call `POST /v1/rooms/join` with the code. The `join_room()` function checks capacity. The response carries the room's socket URL.
5. **Play.** Each player opens `GET /rooms/{id}/ws` on the game server. One instance owns the room (Redis lease) and runs its state machine: select clue → read → buzzing opens → first valid buzz wins → answer → judge → score. Every state change is a `ServerMessage` with an increasing `seq`, published to the room's Redis channel and relayed by whichever instance holds each player's socket.
6. **Judge.** Go's `judge` package returns a verdict instantly. The host can override it. A disputed answer can be appealed to the worker's LLM judge.
7. **Finish.** The game server writes `games`, `game_players`, and `answers`, and marks the room closed. Rails serves history from those tables.

## Who owns what

| Data | Writer | Readers |
|---|---|---|
| `profiles` | api (as user) | api, game |
| `rooms`, `room_members` | api (create, join, leave); game (status) | api, game |
| `clues` (catalog) | worker (owner role, imports) | game_engine only |
| `board_clues` | worker (build), game (state) | members, game |
| `games`, `game_players`, `answers` | game (game_engine) | members (read-only) |
| Live phase, timers, buzz order | game, in memory + Redis | clients via WebSocket |

See [data-and-isolation.md](./data-and-isolation.md), [realtime-game-server.md](./realtime-game-server.md), and [api-contract.md](./api-contract.md).
