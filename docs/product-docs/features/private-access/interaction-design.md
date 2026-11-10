# Private Access: Interaction Design

> **Not yet implemented.** See the [feature brief](./feature-brief.md).

## Screens

| Path | Who | What changes |
|---|---|---|
| `/` (Home) | anyone | **Host a game** on a device without host access opens the host-code sheet first. With host access, it goes straight to the name prompt. Code field + **Join** unchanged. |
| Host-code sheet (over Home) | host device | "Schmegettes is invite-only", code field, **Continue** |
| `/join/{code}` | phones | Unchanged |

## States of the host device

```text
no host access ──Host a game──▶ entering host code ──code ok──▶ name ──▶ lobby (as today)
       ▲                              │
       └──────────── Cancel ──────────┘
host access ──Host a game──▶ name ──▶ lobby
host access ──removed by admin──▶ (next Start / Rematch refused; next Host a game asks for a code)
```

## Flows

### First time hosting

1. On Home, the host presses **Host a game**.
2. Host-code sheet:

```text
┌──────────────────────────────────────────┐
│  Schmegettes is invite-only               │
│  Enter the host code you were given.      │
│                                           │
│  [ K7RX-M2PQ  ]                           │
│                                           │
│  [ Continue ]                    Cancel   │
└──────────────────────────────────────────┘
```

   - The field upper-cases as you type and adds the dash after 4 characters. **Continue** is enabled at 8 characters.
3. Code accepted: the sheet closes, and the usual "What's your name?" prompt opens, then the lobby ([lobby](../lobby/interaction-design.md#host-a-game-host-device)).

Later visits on that device skip step 2.

### Join (phone)

Unchanged: room code, then name, then the buzzer. No host-code prompt ever appears on a phone that only joins.

## Edge cases

| Situation | What happens |
|---|---|
| Wrong code, or a code already spent | Under the field: "That code didn't work." The field keeps the text so a typo can be fixed. |
| 5 tries in a minute | "Too many tries. Wait a minute and try again." **Continue** is disabled for the rest of the minute. |
| Two people enter the same code at the same moment | The first one gets host access. The second sees "That code didn't work." |
| Host access removed while in the lobby | **Start** fails: "Your host access was removed, so you can't start games." The room stays open until it closes as usual. |
| Host access removed during a game | The game plays to the end. **Rematch** fails with the same message. |
| Host cleared browser data, or uses a new device | **Host a game** asks for a code again. Their old games stay with the old device's account. |
| A device without host access calls the API directly (create room, Start) | Refused by the server. Nothing is created and no clue is read. |
| A host joins someone else's room by code | Works like any contestant. Host access isn't needed or used. |
| Lobby open at release with a host who has no access | Start is refused. The lobby closes after 30 minutes idle. |
