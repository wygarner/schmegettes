---
jira-type: new-feature
jira-title: "Host a game: create a room and run the lobby"
---
# Task spec: lobby

Product: [product-brief.md](./product-brief.md), [feature-brief.md](../../docs/product-docs/features/lobby/feature-brief.md), [interaction-design.md](../../docs/product-docs/features/lobby/interaction-design.md).

**What ships:** Host a game → name → room → TV lobby (code, join URL, "Hosted by", live contestants, Join/Leave the game, Start). Phones: code → name → "You're in". Start with 2 or more contestants moves everyone to `building_board` through `start_game()`.

**Not in this task:** the in-game player bar (it ships with gameplay), the board UI, room settings UI, QR code, kicking, spectator join UI, Redis fan-out and room ownership (see Decisions).

## Decisions (approve with the spec)

1. **The lobby runs on one `game/` instance, with no Redis yet.** Lobby state can be rebuilt from Postgres: members, names, `host_plays`, and status all live there. Presence is per socket. A restart costs a reconnect and loses nothing. Redis fan-out, leases, and snapshots arrive with the first gameplay task, when timers and scores need them. `realtime-game-server.md` gets a "Current state" note.
2. **The Go groundwork is built here: `golib/`, plus `oapi-codegen` for `api/`.** `api/` and `game/` both need JWT verification and `db.AsUser` for the first time in this task. The `scaffold-services` brief lists the same helpers, so its scope shrinks to toolchains, lockfiles, and CI. That brief is updated in this task's PR.
3. **Display names live in `room_members.display_name`** (per room, suffixed, editable until Start). `profiles.display_name` is the "last used" name, updated whenever a name is set. The prefill comes from `localStorage`, which is per device as the product asks, with the profile as fallback. `start_game()` snapshots the room name into `game_players`.
4. **A playing host is `rooms.host_plays = true`.** The `room_members` primary key stays one row per user (`role = 'host'`). `start_game()` writes that host's `game_players.role` as `contestant`, so fresh boards, placement, and history treat them as a player with no change to the history rules.
5. **Lobby membership has one writer per kind of change.** Joining is REST, because membership has to exist before the socket can connect. Everything else is socket intents handled by `game/` through `game_engine` functions: rename, leave, host plays, and Start. `game/` reloads members whenever a socket connects, and that's how a REST join reaches the TV.
6. **Start and join are settled in Postgres.** `join_room()` and `start_game()` both take `select … for update` on the room row, and `join_room()` refuses contestants unless `status = 'open'`. A join that's still in flight when Start commits gets "already started". If `start_game()` fails, the room stays open.

## Subtasks (narrow → wide)

### 1. `shared/`: contracts (additive, except as noted)

`shared/openapi.yaml`:

- `POST /v1/rooms` request: add `displayName` (string, 1–20 characters, **required**). This adds a required field, which is normally breaking, but nothing serves or calls this endpoint yet (api has no `/v1` routes), so no client breaks. The PR description says so.
- `POST /v1/rooms/join` request: add `displayName` (string, 1–20 characters, **required**, same reasoning). Responses: `409` problem `type` is `…/problems/room-full` or `…/problems/game-started`. `404` covers unknown and closed rooms.
- New `GET /v1/rooms/by-code/{code}`: members only (RLS). Returns `RoomJoin`. Used by the host page and the phone after a reload. A non-member gets `404`.
- `Room`: add `hostDisplayName` (string) and `hostPlays` (boolean), both required in the response. No response is served yet.
- `POST /v1/rooms` `201` now returns `RoomJoin`, not `Room`, so the host gets `gameSocketUrl` too. Same reasoning: nothing is served yet.

`shared/schemas/protocol/client-message.schema.json`, new messages:

| `type` | Fields | Who | Phase |
|---|---|---|---|
| `set_display_name` | `displayName` (1–20) | any member | `lobby` |
| `set_host_plays` | `plays` (boolean) | host only | `lobby` |
| `leave_room` | — | non-host | `lobby` |

`start_game` already exists and is unchanged.

`shared/schemas/protocol/server-message.schema.json`:

- New `lobby_updated`: `roomId`, `seq`, `hostUserId`, `hostDisplayName`, `hostPlays`, `maxPlayers`, `players` (array of `Player`, in join order; the host appears only when `hostPlays`, with `role: "host"`). Sent on every membership, name, presence, or `hostPlays` change.
- New `room_closed`: `roomId`, `seq`, `reason` (`host_absent` | `replaced`).
- `RoomSnapshot`: add optional `hostDisplayName`, `hostPlays`, `maxPlayers` (present in `lobby`). In `lobby`, `round` is `single` and `board` is `[]`.
- `Error.code`: add `not_enough_players`, `game_started`, `invalid_name`.

Run `mise run gen` and commit `shared/generated/ts`, `game/internal/contracts`, worker contracts, and the new `api/internal/contracts` (subtask 3 adds the generator).

### 2. `supabase/`: migration `supabase migration new lobby`

Tables:

- `rooms`: add `host_plays boolean not null default false`. Drop the `rooms_code_key` unique constraint, and add a partial unique index `rooms_live_code_idx on rooms (code) where status <> 'closed'`, so codes can be reused after a room closes.
- `room_members`: add `display_name text check (char_length(display_name) between 1 and 20)`. It's nullable for rows from before this migration, and readers use `coalesce(m.display_name, p.display_name)`.

Functions (all `security definer`, `set search_path = ''`, `revoke all … from public`):

| Function | Grant | Does |
|---|---|---|
| `create_room(host_name text) returns uuid` | `authenticated` | Trims and checks the name (1–20). Upserts `profiles(display_name)` for `auth.uid()`. Closes the caller's rooms with `status = 'open'`. Generates a code from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, retrying on `unique_violation` (max 10 tries, then raise). Inserts the room; the existing trigger adds host membership. Sets the host's `room_members.display_name`. |
| `join_room(room_code text, member_name text, join_role player_role default 'contestant') returns uuid` | `authenticated` | Replaces the two-argument version (drop it; there are no callers). Looks up `code = upper(room_code) and status <> 'closed'` `for update`. An existing member returns the id with no change, which makes rejoining idempotent. A contestant joining when `status <> 'open'` raises `game started` (`55000`). Capacity counts contestants plus the host when `host_plays` (`23P01`). The name gets a unique suffix within the room (`Alice`, `Alice 2`, `Alice 3`…, case-insensitive). Upserts the profile name. |
| `set_member_name(target_room uuid, target_user uuid, member_name text) returns text` | `game_engine` | `status = 'open'` only. Suffix rule, ignoring the user's own current row. Updates the profile. Returns the stored name. |
| `set_host_plays(target_room uuid, plays boolean) returns void` | `game_engine` | `status = 'open'` only. Turning it on checks capacity, and re-suffixes the host's name against contestants (the later of the two gets the suffix). |
| `leave_room(target_room uuid, target_user uuid) returns void` | `game_engine` | Deletes a non-host membership. Does nothing when there's no row. |
| `start_game(target_room uuid)` | `game_engine` (existing) | Additions: raise `not enough players` (`55000`, message distinct) when contestants plus `host_plays` < 2. Insert the host's `game_players.role` as `contestant` when `host_plays`. Use `coalesce(m.display_name, p.display_name)`. Update the comment that says the host never plays. |

Grants: `game_engine` gets `update (host_plays, status) on rooms` and `update (display_name), delete on room_members`, with matching `for update` / `for delete` policies for `game_engine`. No new `authenticated` table rights: users write only through the functions above.

**Compatibility:** nothing running calls `join_room` or reads the changed columns. The partial index is compatible with existing data. `game_results` placement already keys on `role = 'contestant'`.

**pgTAP: new `supabase/tests/lobby.test.sql`:**

- `create_room` gives a code matching `^[2-9A-HJKMNP-Z]{5}$` and a host membership with the given name, and closes the caller's previous open room
- `create_room` and `join_room` reject empty or 21-character names
- Duplicate names get suffixes (`Alice`, `Alice 2`), and a rejoin keeps the name
- `join_room` returns `room full` at max capacity, with and without `host_plays`
- `join_room` returns `game started` for a contestant after `start_game`, while a spectator still joins
- `join_room` on a closed room's code returns not found. A new room can reuse a closed room's code.
- `set_host_plays` and `set_member_name` are refused when not `open`. `authenticated` can't execute them.
- `start_game` raises with 1 contestant and succeeds with 1 contestant plus `host_plays`. The host's `game_players.role` is `contestant` and they get a placement.
- A user can't update another member's `display_name` or `rooms.host_plays` directly

### 3. `golib/` and codegen

- New Go module `golib/` (`schmegettes/golib`), imported by `api/` and `game/` with a `replace` directive:
  - `golib/auth`: verifies a Supabase JWT against `SUPABASE_JWKS_URL` (cached; refreshed when an unknown `kid` arrives), checks `aud = authenticated` and `exp`, and returns the claims
  - `golib/db`: a `pgxpool` from `DATABASE_URL`. `AsUser(ctx, claims, fn)` runs `set local role authenticated` plus `set_config('request.jwt.claims', …, true)`. `AsEngine(ctx, fn)` runs `set local role game_engine`. One transaction each.
  - `golib/logging`: the slog JSON setup that both `main.go` files already copy
- `shared/scripts/gen.ts`: add `oapi-codegen` (pinned version, strict server, std `net/http`) → `api/internal/contracts/contracts_gen.go`

### 4. `api/`

- `internal/rooms`: `POST /v1/rooms` → `create_room`, then a read of the room as the user. `POST /v1/rooms/join` → `join_room`. `GET /v1/rooms/by-code/{code}`. Each returns `RoomJoin` with `gameSocketUrl = GAME_PUBLIC_URL + /rooms/{id}/ws`.
- SQL errors map to problems: `P0002` → 404; `23P01` → 409 room-full; `55000` → 409 game-started; `22023` or name check → 400.
- Middleware: auth (golib), CORS from `ALLOWED_ORIGINS`, `x-request-id`, one log line per request. Add `GAME_PUBLIC_URL` to `.env.example`.
- Wire the routes in `cmd/api/main.go`. Add `dev:api` to `mise.toml` `tasks.dev`.

### 5. `game/`

- `GET /rooms/{roomID}/ws`: read the JWT from the `bearer.` subprotocol, verify it (golib), and check membership with `AsUser` (`is_room_member`). Accept with subprotocol `schmegettes.v1`. Use `coder/websocket`.
- `internal/room`: an in-process `Hub` (map of room id → `Room`), with one goroutine per room owning its state. All mutations go through its channel, which serializes intents.
  - On the first socket, load the room and its members as `game_engine`. Reload members on every new socket, and after each mutating function call.
  - Presence: a member is `connected` while at least one socket is open (a reload can overlap). A disconnect broadcasts `lobby_updated`.
  - Intents: `set_display_name`, `set_host_plays` (host only → `not_host`), `leave_room` (closes that socket after a broadcast), `start_game` (host only; fewer than 2 → `not_enough_players`). Start broadcasts `phase_changed: building_board`, then calls `start_game()`. On error, `phase_changed: lobby` plus an `error` (`internal`, message "Couldn't build a board. Try again."). Start is ignored unless the phase is `lobby`, which covers double presses.
  - Host absence: when no host socket has been open for 30 minutes in `lobby`, set `status = 'closed'`, broadcast `room_closed: host_absent`, close the sockets, and drop the room.
  - Every 30 s, re-read `rooms.status`. When it's `closed` (replaced by a newer room), broadcast `room_closed: replaced` and drop the room.
  - `seq` is +1 per broadcast. Send `room_snapshot` on connect.
- Validate incoming messages against the generated contracts. Invalid input gets `error: invalid_message`.

### 6. `web/`

- `lib/env.ts`: no change if `apiUrl` is enough (`gameSocketUrl` comes from the API).
- `lib/displayName.ts`: get and set the last name in `localStorage` (`schmegettes.displayName`), with every access wrapped in `try/catch`.
- `pages/Home.tsx`: **Host a game** opens a name modal (prefilled; **Create room** disabled when empty; spinner; one request) → `POST /v1/rooms` → navigate to `/host/{code}`. On failure, show "Couldn't create a room. Try again." **Join** → `/join/{code}`.
- `pages/HostLobby.tsx` (`/host/:code`): `GET by-code` → socket. Shows the code (largest element, letters spaced, Oswald), "Join at {origin}/join", "Hosted by {name}" with ✎ (sends `set_display_name`), players with "n / max" and dimmed "(reconnecting)", **Join the game** / **Leave the game** (disabled with "Room is full" when full), and **Start** (disabled below 2, with the hint "Need at least 2 players"; spinner after pressing). A non-host gets "Only the host can open this screen" with a link to `/join/{code}`. On `building_board`: "Shuffling a fresh board…". On `room_closed`: "This room has closed."
- `pages/JoinRoom.tsx` (`/join/:code`): `GET by-code` first. If already a member, connect straight away with no prompt. Otherwise "What's your name?" → `POST join` → socket → "You're in, {name}. Look at the TV. {host} will start the game." with **Edit name** and **Leave**. Errors: "No room with that code." / "This room is full (n/max)." / "This game has already started." / "This room has closed."
- `lib/useRoom.ts`: a hook wrapping `GameSocket`. It reduces `room_snapshot`, `lobby_updated`, `phase_changed`, `room_closed`, and `error` into lobby state, and reconnects on drop.
- Routes in `main.tsx`.

### 7. Docs

- `docs/system-docs/architecture/realtime-game-server.md`: lobby messages and intents, the "single instance until gameplay" note, and the start/join race rule
- `docs/system-docs/architecture/data-and-isolation.md`: `room_members.display_name`, `rooms.host_plays`, the new functions and who may call them
- `docs/system-docs/engineering/stack.md` "Access patterns": `golib/` now exists, with `AsEngine`
- `api/SETUP.md`: routes, `GAME_PUBLIC_URL`
- `tasks/scaffold-services/product-brief.md`: remove the outcomes this task delivers (golib, JWT, `AsUser`)

## Key files

`shared/openapi.yaml`, `shared/schemas/protocol/*.schema.json`, `shared/scripts/gen.ts`, `supabase/migrations/*_lobby.sql`, `supabase/tests/lobby.test.sql`, `golib/{auth,db,logging}/`, `api/cmd/api/main.go`, `api/internal/rooms/`, `game/cmd/game/main.go`, `game/internal/room/`, `web/src/pages/{Home,HostLobby,JoinRoom}.tsx`, `web/src/lib/{useRoom,displayName}.ts`, `web/src/main.tsx`.

## Success criteria

1. Host a game → name → `/host/{code}` shows the code and "Hosted by {name}" in under 1 s locally
2. A phone joining with the code and a name appears on the TV under that name within 1 s. A duplicate name shows as "Name 2".
3. Name edits on either device update the TV live
4. Join the game puts the host in the list and counts them. Leave the game removes them.
5. Start is disabled at 0–1 contestants, and the server also refuses it (`not_enough_players`). With 2 or more, the TV and every phone show `building_board`. A later contestant join gets "already started", and a spectator join still works.
6. Reloading the TV or a phone returns to the same room, names, and list, with no prompt
7. A disconnected player is dimmed and still counted. Leave removes them at once.
8. Creating a second room closes the first, whose phones see "This room has closed" within 30 s. A lobby whose host has been gone for 30 minutes closes.
9. Codes never contain `0 O 1 I L`
10. No contract consumer is broken. Generated code is committed and up to date.

## Test plan (targeted only)

| Package | Tests | Command |
|---|---|---|
| supabase | `lobby.test.sql` (above); `game_history.test.sql` still passes with the new `start_game` | `mise run db:test` |
| golib | JWT: valid, expired, wrong aud, unknown kid triggers a refresh (local JWKS test server); `AsUser` sets role and claims (against local Supabase) | `cd golib && go test -race ./...` |
| api | `internal/rooms` handler tests: create, join, by-code, each error → problem, responses validated against `shared/openapi.yaml` (`kin-openapi`) | `mise run test:api -- ./internal/rooms/...` |
| game | `internal/room`: intent authorization (host only), not enough players, Start double press, presence with two sockets, host-absence timer (injected clock), `room_closed` on status poll, seq increments. WS handshake test: rejects a missing or bad token, never echoes the token. | `mise run test:game -- ./internal/room/... ./cmd/game/...` |
| web | `Home.test.tsx` (name modal, disabled empty, prefill, create error), `HostLobby.test.tsx` (Start disabled below 2, Join/Leave the game, reconnecting dim, closed), `JoinRoom.test.tsx` (each error message, rejoin without prompt), `displayName.test.ts` (storage throwing) | `mise run test:web -- src/pages/Home.test.tsx src/pages/HostLobby.test.tsx src/pages/JoinRoom.test.tsx src/lib/displayName.test.ts` |
| shared | contract fixtures for the new messages validate | `bun run --cwd shared test` |

Manual: two browsers plus a phone on the LAN, running through success criteria 1–8.

## Logging

| Service | Event | Level | Fields |
|---|---|---|---|
| api | request line | info | `request_id`, `user_id`, `method`, `route`, `status`, `duration_ms` |
| api | `room created` | info | `room_id`, `user_id` |
| api | join refused (full / started / not found) | debug | `room_id` (if known), `user_id`, `reason` |
| game | `room loaded` / `room dropped` | info | `room_id`, `reason` |
| game | `socket rejected` | warn (bad token) / debug (not a member) | `room_id`, `reason` |
| game | `game start requested` / `start_game failed` | info / error (`err`) | `room_id`, `user_id`, `game_id` |
| game | `room closed` | info | `room_id`, `reason` |

Never log: JWTs, the `Authorization` header, `Sec-WebSocket-Protocol`, display names, whole messages or bodies, `DATABASE_URL`. Not-enough-players, full rooms, and late joins are gameplay, not errors.

## Docs to update

Listed in subtask 7.

## Branch
`new-feature/lobby`, from and into `daily/2026-10-27`. There is no Jira key: Jira isn't configured (`.github/jira.json` issue types are `REPLACE_ME`, and the secrets are unset).
