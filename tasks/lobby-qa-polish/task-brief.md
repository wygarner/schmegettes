---
task-type: enhancement
task-title: "Host lobby: QR code, join URL up top, host renames players, simpler options"
---
# Task spec: lobby-qa-polish

Product brief: `tasks/lobby-qa-polish/product-brief.md`. Product docs: `docs/product-docs/features/lobby/feature-brief.md` and `interaction-design.md` (layout, rename sheet, every edge case), and the "default spoken clue value" wording in `docs/product-docs/features/gameplay/`.

## Approach

**Host renames a player.** The game server already renames through `public.set_member_name(room, user, name)` (run as `game_engine`), which takes the target user, applies the "Name 2" rule, and then calls `remember_display_name`, which saves the name as that user's prefill. A host rename must **not** become the player's prefill, so it gets its own function: `public.rename_member(room, user, name)`. It's the same as `set_member_name` but without `remember_display_name`, and it's granted only to `game_engine`.

On the socket, `SetDisplayName` gains an optional `userId`:
- **Absent, or equal to the sender:** unchanged. The sender renames themself and the name is remembered. That includes the host renaming themself from the "Hosted by" footer or their own row.
- **Another user:** host only (`not_host` otherwise), phase `lobby` and not a resume lobby (`r.lobby.Resume == nil`; `wrong_phase` otherwise, since a resumed game keeps its names), and the target must be a member (`invalid_message` otherwise). It calls `rename_member`. Then the usual `lobby_updated` goes out, so the TV list and the renamed phone ("You're in, Dan", which already reads `me.displayName`) update with no new message type.

The latest write wins: there's no lock between a player's own edit and the host's.

**QR code.** Add `qrcode-generator` (MIT, about 20 kB, no dependencies) to `web/` and render an inline SVG with dark modules on a white square and a 4-module quiet margin, error correction M. Encode `${window.location.origin}/join/${code}`. `/join/{code}` already exists and starts at the microphone step. Put it in a small `JoinQr` component in `web/src/ui/`, with `role="img"` and `aria-label="QR code to join room K7RXM"`.

**Lobby layout** (`HostLobby.tsx`):
- The top line becomes the Wordmark plus "Join at {host}/join" on the right. The inline host-name editor and the "Rematch ·" prefix go.
- `StageBody` stacks `JoinQr` centered **above** `CodeTiles`. Size both from the stage's height:
  - the QR at about `30cqh` (≥ 88 px at 667 × 320, ≥ 110 px at 844 × 390);
  - `CodeTiles` at about `26cqh` tall, down from `38cqh`, with the font scaled to match (about `19cqh`; keep the `cqw` caps).
  - With the rematch, resume or narrator line under the code, it must still fit at 667 × 320 with no scrolling. The QR shrinks first, down to its minimum.
- The `summary(options)` line is deleted. The narrator-unavailable notice moves under the code.
- The resume lobby gets the same top line and QR.

**Player menu** (`LobbyPlayers`):
- Each row gets an ✎ `ActionIcon` (44 × 44 tap target, `aria-label="Rename Alice"`). It's hidden in a resume lobby and after Start.
- ✎ opens a `Sheet` titled "Rename {name}", prefilled, with the 1–20 rule from `lib/displayName.ts`, **Save** and **Cancel**. Save sends `set_display_name` with the target's `userId`. The host's own row and the new footer "Hosted by {name} ✎" send it without `userId`.
- The sheet closes without saving when the phase leaves `lobby`.

**Options sheet** (`GameOptionsSheet.tsx`):
- Delete `DIFFICULTY_TEXT` and the line under Difficulty.
- Replace the Quick picks `Switch` with a `SegmentedControl` labelled "Default spoken clue value", options **Ask** (`quickPicks: false`) and **Lowest left** (`true`), and the fixed hint "When a player says just the category".
- `quickPicks` stays the stored and contract name, so saved options carry over unchanged.
- Remove `summary()` from `lib/gameOptions.ts` if nothing else uses it (today only HostLobby does), with its tests.

## Subtasks (narrow → wide)

1. **shared** (additive): `shared/schemas/protocol/client-message.schema.json` → `SetDisplayName` gets an optional `userId` (uuid). Update the description: "Lobby only. Without userId (or with your own), renames the sender. With another member's userId, host only: renames that member for this room without changing their remembered name." Run `mise run gen` and commit.
2. **supabase:** a new migration adding `public.rename_member(uuid, uuid, text)`, security definer, `search_path = ''`, `revoke all … from public`, `grant execute … to game_engine`, plus pgTAP tests.
3. **game:**
   - `room.go` `set_display_name` branch: the host and target checks above.
   - `Store` interface: `RenameMember(ctx, roomID, userID, name)`; `PGStore` calls `rename_member`.
   - The fake store in tests.
4. **web:**
   - `ui/JoinQr.tsx`
   - `HostLobby.tsx`: the layout, `LobbyPlayers` ✎ and footer, the rename sheet
   - `GameOptionsSheet.tsx`
   - `lib/gameOptions.ts`
   - `package.json` and the lockfile (`qrcode-generator`)
5. **docs:** see "Docs to update".

## Key files

- `shared/schemas/protocol/client-message.schema.json`, plus the generated `game/internal/contracts/contracts_gen.go` and the web protocol types
- `supabase/migrations/{ts}_rename_member.sql`, `supabase/tests/lobby.test.sql`
- `game/internal/room/room.go`, `pgstore.go`, the store interface, `room_test.go`
- `web/src/pages/HostLobby.tsx` (+ test), `web/src/game/GameOptionsSheet.tsx` (+ test), `web/src/lib/gameOptions.ts` (+ test), `web/src/ui/JoinQr.tsx` (+ test), `web/package.json`

## Contracts preserved

One additive change: an optional `userId` on `SetDisplayName`. Old clients never send it and keep today's behavior, so the subprotocol stays `schmegettes.v1`. `RoomOptions.quickPicks`, `room_snapshot.quickPicks` and `PATCH /v1/rooms/{roomId}` are unchanged. No REST change.

## Success criteria

- The product brief's success criteria.
- A non-host sending `set_display_name` with another member's `userId` gets `not_host`, and nothing changes. After Start, or in a resume lobby, it gets `wrong_phase`.
- A host rename doesn't change `profiles.display_name` (the prefill) for the renamed user. A self-rename still does.
- The QR decodes to `{origin}/join/{code}` (unit test with the generator's matrix, or a decode in the test).
- No `summary` or "Game options in use" text in the lobby. No difficulty descriptions. The "Default spoken clue value" control writes `quickPicks`.

## Test plan

- **db** (`mise run db:test`): in `supabase/tests/lobby.test.sql`, `rename_member`:
  - renames a member
  - suffixes a taken name
  - doesn't touch `profiles.display_name`
  - raises on a non-member and on a closed room
  - can't be called as `authenticated` (42501)
- **game** (`mise run test:game -- ./internal/room/...`):
  - host renames another member → `lobby_updated` with the new name
  - non-host with `userId` → `not_host`
  - `userId` equal to the sender → self path, remembered
  - unknown `userId` → `invalid_message`
  - after Start → `wrong_phase`
  - resume lobby → `wrong_phase`
  - name 21 characters → `invalid_name`
- **web**:
  - `mise run test:web -- src/pages/HostLobby.test.tsx`:
    - ✎ on each row opens "Rename Alice" and Save sends `{type:"set_display_name", userId, displayName}`
    - the footer renames the host without `userId`
    - no ✎ in a resume lobby
    - the top line shows "Join at …/join" and no "Hosted by"
    - no options line
    - the QR is present with its label, and comes before the code tiles in DOM order
  - `src/game/GameOptionsSheet.test.tsx`: no difficulty descriptions; Ask and Lowest left map to `quickPicks` false and true
  - `src/ui/JoinQr.test.tsx`: the encoded URL
  - `src/lib/gameOptions.test.ts`: drop the `summary` tests if `summary` is removed
- **Agent QA** per `docs/system-docs/quality/agent-qa.md`: lobby at 844 × 390 and 667 × 320, folded and open; rename on a second browser profile; one manual camera scan on staging (record the result on the PR).

## Database migration plan

- `supabase migration new rename_member`: creates `public.rename_member(target_room uuid, target_user uuid, member_name text) returns text`. Same body as `set_member_name`, minus `remember_display_name`.
- No new tables, so no RLS changes. Grants: `revoke all from public`, `grant execute to game_engine`.
- Compatible with the running code: a new function only; old `game` never calls it.

## Logging requirements

On a host rename, `game` logs at `info`: message `member renamed by host`, with `room_id` and `target_user_id`. Never the old or new name, and never the message body. No tokens, answers, or emails.

## Docs to update

- `docs/system-docs/architecture/realtime-game-server.md`: the `set_display_name` row (the host form, `rename_member`)
- `docs/product-docs/features/lobby/feature-brief.md` and `interaction-design.md`, and `gameplay/feature-brief.md`: remove the "Not yet implemented (task `lobby-qa-polish`)" notes and the "Called Quick picks until…" clause
- `docs/system-docs/` license or third-party list, if the repo keeps one: add `qrcode-generator` (MIT)
