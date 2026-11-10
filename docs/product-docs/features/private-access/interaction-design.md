# Private Access: Interaction Design

> **Not yet implemented.** See the [feature brief](./feature-brief.md).

## Screens

| Path | Who | What changes |
|---|---|---|
| `/` (Home) | anyone | **Host a game** asks a signed-out device to sign in first. A signed-in host sees "Signed in as {email} · Sign out" under the buttons. Code field + **Join** unchanged. |
| Sign-in sheet (over Home) | host device | "Schmegettes is invite-only" + **Sign in with Google** |
| Not-invited sheet (over Home) | host device | Says the account isn't invited; **Use another account** |
| `/join/{code}` | phones | Unchanged |

## States of the host device

```text
anonymous ──Host a game──▶ signing in ──▶ invited ──▶ name ──▶ lobby (as today)
    ▲                          │    │
    │                          │    └──▶ not invited ──Use another account──▶ signing in
    └────────── cancel ────────┘                     └──Back──▶ anonymous
invited ──Sign out──▶ anonymous
```

## Flows

### First time hosting (invited host)

1. On Home, the host presses **Host a game**.
2. Sign-in sheet:

```text
┌──────────────────────────────────────────┐
│  Schmegettes is invite-only               │
│  Sign in with the Google account you      │
│  were invited with.                       │
│                                           │
│  [ Sign in with Google ]      Cancel      │
└──────────────────────────────────────────┘
```

3. Google sign-in, by redirect (iOS Safari blocks pop-ups), returning to Home.
4. Invited: the usual "What's your name?" prompt, then the lobby ([lobby](../lobby/interaction-design.md#host-a-game-host-device)).

Later visits on that device skip steps 2–3.

### Not invited

```text
┌──────────────────────────────────────────┐
│  You're not on the invite list            │
│  sam@example.com can't host games.        │
│  Ask the person who invited you to add    │
│  this address. You can still join a game  │
│  with a code.                             │
│                                           │
│  [ Use another account ]        Back      │
└──────────────────────────────────────────┘
```

The device stays signed in to that account. It can still join games by code.

### Join (phone)

Unchanged: code, then name, then the buzzer. No sign-in prompt ever appears on a phone that only joins.

## Edge cases

| Situation | What happens |
|---|---|
| Sign-in cancelled, or Google fails | Back on Home, signed out. Toast: "Sign-in didn't finish. Try again." |
| Invite removed while in the lobby | **Start** fails: "Your invite was removed, so you can't start games." The room stays open until it closes as usual. |
| Invite removed during a game | The game plays to the end. **Rematch** fails with the same message. |
| Not-invited user calls the API directly (create room, Start) | Refused by the server. Nothing is created and no clue is read. |
| Invited host joins someone else's room by code | Works like any contestant. The invite isn't needed or used. |
| The Google account was used on another device | This device switches to that account. Its own anonymous history stays behind ([feature brief](./feature-brief.md#invites)). |
| Lobby open at rollout with an uninvited host | Closed. Phones see "This room has closed." |
| Invite email in a different case (`Sam@Example.com`) | Matches |
