---
jira-type: new-feature
jira-title: "Host a game: create a room and run the lobby"
---
**Task Type:** New Feature

**Problem:** **Host a game** on Home does nothing. No room is created, so there's no code to share, nowhere for players to land, and no way to start. Nothing playable can happen until this works.

**Outcomes:**

- One press of **Host a game** creates a room and puts its code on the TV in under a second
- The host sees players appear live as they join
- The host can get their own phone into the game by scanning a QR code, with no typing
- The host starts the game with one press, and joining closes

Durable docs: `docs/product-docs/features/lobby/feature-brief.md` and `interaction-design.md`.

**Player flow:**

1. **Host device:** Home → **Host a game** (spinner, no double create) → `/host/{code}`. The lobby shows the code (largest element), a QR code to `/join/{code}`, the join URL, the player list with "n / max", **Join from my phone**, and **Start**.
2. **Join from my phone:** a modal with a large QR code. The host's phone joins as an ordinary contestant. The host device itself never plays (product overview).
3. **Phone:** code (typed or from the QR) → name (1–20 characters, prefilled with the last one used) → "You're in, {name}. Look at the TV." with **Leave**.
4. **Start:** enabled with 1 or more contestants. It sends `start_game`, joining closes, and the TV and phones go to `building_board` ("Shuffling a fresh board…").

**Rules and edge cases:**

- Codes: 5 characters, with no look-alikes (`0 O 1 I L`), unique among rooms that aren't closed
- One open lobby per host. Creating a new room closes the host's earlier room that is still in `lobby`.
- Reloading the TV or a phone returns to the same room as the same person
- A disconnected player stays listed, dimmed. **Leave** removes them at once.
- A lobby whose host has been disconnected for 30 minutes closes
- Errors on the phone: unknown code, room full, already started, room closed. Each has its own message (see interaction-design.md).
- Duplicate names get a suffix ("Alice 2")
- A double press of Start counts once. A join still in progress when Start is handled gets "already started".
- Anonymous sign-in happens silently on both host and player devices

**Success Criteria:**

- Host a game → code visible on `/host/{code}` with no further input
- A phone joining with that code appears on the TV within 1 s, and its name is right
- Scanning the QR code from a phone lands on `/join/{code}` with the code filled in
- Start is disabled at 0 contestants. With 1 or more, pressing it moves the TV and every phone to `building_board`, and later joins are refused.
- Reloading either device keeps the room and the player list

**Out of scope:** room settings UI (seasons, max players), kicking players, spectator join UI, the host device as a contestant, the board and gameplay after Start.
