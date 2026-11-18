---
jira-type: enhancement
jira-title: "Ask for the microphone first and block play until it's allowed"
---
# Task spec: microphone-gate

Product brief: `tasks/microphone-gate/product-brief.md`. Rules: `docs/product-docs/features/gameplay/interaction-design.md#microphone-permission`, lobby `feature-brief.md` (Joining; Join the game) and `interaction-design.md`.

## Approach

Client only. The gate is one component, `MicGate`, used in three places: the phone join flow, the reload/rejoin path, and the host's **Join the game**. It replaces `MicPrompt`.

**Asking for everything at once.** Today `requestMicrophone()` only calls `getUserMedia`, but answers use `SpeechRecognition`, which on iOS asks for a second permission (speech recognition) the first time it starts, mid-game. The gate's **Allow microphone** does both, inside the tap: `getUserMedia({ audio: true })` (stop the tracks), then start a recognizer (`createRecognizer()`) and abort it on its `start`/`audiostart` event (or after 1.5 s). Outcome: `granted`, `denied` (either refused), or `unsupported` (no `getUserMedia` or no recognition).

**Knowing whether to show it.** Use `navigator.permissions.query({ name: "microphone" })` where it works (Chrome; Safari 16+). `granted` → skip the gate. `prompt`, `denied`, a missing API or an error → show it. iPhone Safari may report `prompt` on each visit, so the gate shows again on a reload; that's expected by the product docs. Subscribe to the status's `change` event for the mid-game case.

**Not added until allowed.** Phones: `JoinRoom` gets a `mic` stage between the code check and the `name` stage. The API's join (`POST /v1/rooms/join`) is called only after the gate and the name, so a player who never allows it is never a room member. The reload path (`roomByCode` returns the membership) shows the gate before `ConnectedPlayer` opens the socket; until then the server sees the player as disconnected and shows "(reconnecting)" with no server change.

**Host.** `HostLobby`'s **Join the game** opens the gate (centered sheet) and sends `set_host_plays: true` only on `granted`. **Cancel** closes it and the host stays a non-playing host. Hosting itself never asks.

**Lost mid-game.** When the permission `change`s to `denied`, the phone shows the gate over the game and **closes its game socket** (the room hook's `leave`-less disconnect), so the server treats the player as disconnected: no buzzing, control handoff after 10 s, a Daily Double answer is no answer. On `granted` it reconnects. The host device does the same for its player role only if the host plays (the TV view itself stays connected; send `set_host_plays` unchanged and just block the host's buzzer and inputs while the gate is up). If blocking the host's inputs without disconnecting proves awkward, raise it in the PR; don't change server rules here.

**Removed:** the lobby `MicPrompt` (phone card and the host's compact button), the second ask at Start, the "Turn on the microphone to answer" warning before each clue, and the "no microphone counts as no answer" handling on the client.

## Subtasks

1. **web: permission helpers** (`web/src/lib/speech.ts`): `requestAnswerPermissions()` (getUserMedia + recognizer start/abort, returns `MicState`), `micPermission()` (Permissions API query, `"granted" | "ask"`), `onMicPermissionChange(cb)`.
2. **web: `MicGate`** (new `web/src/game/MicGate.tsx`): the three states from the docs: ask (🎤, copy, **Allow microphone**, **Leave**), blocked (per-browser steps for iPhone Safari and Chrome, **Try again**, **Leave**), unsupported ("This browser can't hear answers. Open {site} in Safari or Chrome.", **Leave**). Host variant: **Cancel** instead of **Leave**.
3. **web: join flow** (`web/src/pages/JoinRoom.tsx`): stages `checking → mic → name → joined`; on reload `checking → mic (if needed) → joined`.
4. **web: host** (`web/src/pages/HostLobby.tsx`): gate on **Join the game**; remove `MicPrompt compact`.
5. **web: mid-game** (`web/src/lib/room.ts` / `ConnectedPlayer`): permission change → gate overlay + socket closed; granted → reconnect.
6. **web: cleanup**: delete `MicPrompt.tsx` and the per-clue warning in `PlayerControls.tsx`.
7. **docs**.

## Key files

`web/src/lib/speech.ts`, new `web/src/game/MicGate.tsx`, `web/src/pages/JoinRoom.tsx`, `web/src/pages/HostLobby.tsx`, `web/src/lib/room.ts`, `web/src/game/PlayerControls.tsx`, deleted `web/src/game/MicPrompt.tsx`.

## Contracts preserved

No change to `shared/`, REST, WebSocket, or the database. Joining and disconnecting use existing calls.

## Success criteria

- iPhone Safari and Android Chrome: a new player can't reach the name step, appear on the TV, or count toward Start without allowing the microphone.
- After allowing it, a full game (spoken pick, answers, a Daily Double) shows no permission prompt (iOS speech-recognition prompt included).
- Denying shows the blocked screen; fixing it in settings and **Try again** continues.
- A host who denies on **Join the game** stays a non-playing host.
- A reload mid-game on iPhone Safari goes through the gate (if asked again) back to the same seat and score.
- Turning the microphone off mid-game shows the gate and the TV shows the player "(reconnecting)".

## Test plan

- `web/src/lib/speech.test.ts`: `requestAnswerPermissions` → granted only when both succeed; denied when either fails; unsupported without recognition; recognizer aborted.
- New `web/src/game/MicGate.test.tsx`: three states, copy, buttons; host variant shows Cancel.
- `web/src/pages/JoinRoom.test.tsx`: no join request before the gate passes; reload path gates before connecting; granted permission skips the gate.
- `web/src/pages/HostLobby.test.tsx`: Join the game sends `set_host_plays` only after granted; Cancel sends nothing.
- `mise run test:web -- src/lib/speech.test.ts src/game/MicGate.test.tsx src/pages/JoinRoom.test.tsx src/pages/HostLobby.test.tsx`
- By hand on iPhone Safari against staging: first join, deny then allow, reload mid-game, permission turned off mid-game.

## Database migration plan

None.

## Logging requirements

None (client only).

## Docs to update

- `docs/system-docs/` mentions of the lobby microphone prompt, if any (`grep -rn -i "microphone" docs/system-docs`).

## Branch

`enhancement/microphone-gate-impl`, from and into `develop`. Jira isn't set up yet (`.github/jira.json` issue types are `REPLACE_ME`), so there's no `SCH-{N}`: the folder keeps its name, and the PR title is `[Enhancement] microphone-gate: …`.
