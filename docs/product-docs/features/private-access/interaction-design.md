# Private Access: Interaction Design

## Screens

| Path | Who | What changes |
|---|---|---|
| `/` (Home) | anyone | **Host a game** on a device without host access opens the host-code sheet first. With host access, it goes straight to the name prompt. Code field + **Join** unchanged. |
| Host-code sheet (over Home) | host device | "Schmegettes is invite-only", code field, **Continue** |
| `/join/{code}` | phones | Unchanged |
| devtools → **Admin** (local only, never deployed) | admin | Current host code, rotate now, hosts list |

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
| Wrong code, or a code that rotated more than 5 minutes ago | Under the field: "That code didn't work." The field keeps the text so a typo can be fixed. |
| Code read out at 12:44, typed at 12:47 (rotated at 12:45) | Accepted: the previous code works for 5 minutes after it rotates. |
| Code typed after the admin pressed **Rotate now** | "That code didn't work." No grace period after a manual rotate. |
| 5 tries in a minute | "Too many tries. Wait a minute and try again." **Continue** is disabled for the rest of the minute. |
| Two people enter the same code at the same moment | Both get host access. Each shows up as a separate host on the admin page. |
| Someone enters the code who already has host access (on another device, signed in) | Accepted; nothing changes. They stay one host, not two. |
| Host access removed while in the lobby | **Start** fails: "Your host access was removed, so you can't start games." The room stays open until it closes as usual. |
| Host access removed during a game | The game plays to the end. **Rematch** fails with the same message. |
| Host cleared browser data, or uses a new device | **Host a game** asks for a code again. Their old games stay with the old device's account. |
| A device without host access calls the API directly (create room, Start) | Refused by the server. Nothing is created and no clue is read. |
| A host joins someone else's room by code | Works like any contestant. Host access isn't needed or used. |
| Lobby open at release with a host who has no access | Start is refused. The lobby closes after 30 minutes idle. |

## Admin page (devtools)

In devtools (`devtools/src/admin/`), above the design prototypes. Locally the seeded code `DEVS-TEST` never rotates on its own; the page says so.

### Sign in

```text
┌──────────────────────────────────────────┐
│  Admin                                    │
│  Environment  ( ) Local  (•) Staging      │
│               ( ) Production              │
│  Email     [ wyatt@…            ]         │
│  Password  [ ••••••••           ]         │
│                                           │
│  [ Sign in ]                              │
└──────────────────────────────────────────┘
```

- Production is shown in red everywhere on the page once chosen, so it's never mistaken for staging.
- Not on the admin list, or wrong password: "Can't sign in as an admin here." (Same message for both, so the page doesn't reveal who is an admin.)
- Signing in here is separate from the web app: it doesn't sign the browser into the game.

### Signed in

```text
┌──────────────────────────────────────────────────────────┐
│  STAGING · wyatt@…                             Sign out    │
│                                                            │
│  Host code      K7RX-M2PQ          [ Copy ]                │
│                 Changes in 31 min (13:30 UTC)              │
│                 Previous code works until 12:50            │
│                 [ Rotate now ]                             │
│                                                            │
│  Hosts (4)                                                 │
│  sam@example.com     since Nov 12   "Thursday trivia" ✎  Remove │
│  Guest · "Priya"     since Nov 17   —                ✎  Remove │
│  …                                                         │
└──────────────────────────────────────────────────────────┘
```

- The code and countdown update on their own; at rotation the new code appears without a reload.
- **Rotate now** asks first: "Retire K7RX-M2PQ now? Anyone who hasn't used it yet will need the new code." → **Rotate** / Cancel.
- **Remove** asks first: "Remove host access for sam@example.com? Their next create, Start, or Rematch will be refused." → **Remove** / Cancel. The row disappears.
- Hosts are listed newest first. A host's note is the admin's own label; hosts never see it.

### Edge cases

| Situation | What happens |
|---|---|
| Session expires while the page is open | The next action returns to sign-in, with the environment kept. |
| Admin removed from the admin list while signed in | The next action shows "Can't sign in as an admin here." |
| Two admins press **Rotate now** at once | One new code results; both pages show it. |
| Admin removes their own host access | Allowed. Admin and host access are separate. |
| The environment is unreachable | "Can't reach {environment}." with **Try again**. Nothing is cached on the computer. |
