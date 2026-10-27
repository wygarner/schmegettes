---
jira-type: new-feature
jira-title: "Host a game: create a room and run the lobby"
---
**Task Type:** New Feature

**Problem:** **Host a game** on Home does nothing. No room is created, so there's no code to share, nowhere for players to land, and no way to start. Nothing playable can happen until this works.

**Outcomes:**

- **Host a game** asks the host's name and creates a room with the code on the TV in under a second
- The host sees contestants appear live, by display name, as they join
- The host can join the game on the host device itself, with no second device
- The host starts the game with one press once 2 contestants are in, and joining closes

Durable docs: `docs/product-docs/features/lobby/feature-brief.md` and `interaction-design.md`.

**Player flow:**

1. **Host device:** Home → **Host a game** → "What's your name?" (prefilled with the last name used) → **Create room** (spinner, no double create) → `/host/{code}`. The lobby shows the code (largest element), the join URL, "Hosted by {name}" (editable), the contestant list with "n / max", **Join the game**, and **Start**.
2. **Join the game:** adds the host to the contestant list under their host name, tagged HOST, and the button becomes **Leave the game**. Both work only until Start. A playing host is a full contestant: they count toward Start, the player limit, fresh boards, history, and placement.
3. **Phone:** code → "What's your name?" (prefilled) → "You're in, {name}. Look at the TV. {host} will start the game." with **Edit name** and **Leave**.
4. **Start:** enabled with 2 or more contestants. It sends `start_game`, joining closes, and the TV and phones go to `building_board` ("Shuffling a fresh board…").

**Rules and edge cases:**

- Display names: 1–20 characters, trimmed, prefilled from that device's last name, editable until Start. Duplicate contestant names get a suffix ("Alice 2"), including a host who joins ("Wyatt 2"). **Join the game** is disabled when the room is full.
- Codes: 5 characters, with no look-alikes (`0 O 1 I L`), unique among rooms that aren't closed
- One open lobby per host. Creating a new room closes the host's earlier room that is still in `lobby`.
- Reloading the TV or a phone returns to the same room as the same person, with no name prompt
- A disconnected contestant stays listed, dimmed, and counts toward Start. **Leave** removes them at once. If the count drops below 2, Start disables again.
- A lobby whose host has been disconnected for 30 minutes closes
- Errors on the phone: unknown code, room full, already started, room closed. Each has its own message (see interaction-design.md).
- A double press of Start counts once. A join still in progress when Start is handled gets "already started".
- Anonymous sign-in happens silently on both host and player devices

**Success Criteria:**

- Host a game → name → code visible on `/host/{code}` with "Hosted by {name}"
- A phone joining with that code and a name appears on the TV under that name within 1 s
- Name edits on either device show on the TV live
- Join the game puts the host in the list. Leave the game removes them. Start counts them.
- Start is disabled with 0–1 contestants. With 2 or more, pressing it moves the TV and every phone to `building_board`, and later joins are refused.
- Reloading either device keeps the room, the names, and the player list

**Out of scope:** QR code, room settings UI (seasons, max players), kicking players, spectator join UI, the board and gameplay after Start. That includes the host's in-game player bar (Buzz, masked Final wager), which ships with gameplay; it's specified in the lobby feature brief and interaction design.

**Architecture change:** the product overview and game-history docs now let the host device play (PR #17). Room membership has to allow the host to also be a contestant.
