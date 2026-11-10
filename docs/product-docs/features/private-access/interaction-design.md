# Private Access: Interaction Design

> **Not yet implemented.** See the [feature brief](./feature-brief.md).

## Screens

| Path | Who | What changes |
|---|---|---|
| `/` (Home) | anyone | **Host a game** asks a signed-out device to sign in first. A signed-in host sees "Signed in as {email} · Sign out" under the buttons. Code field + **Join** unchanged. |
| Email sheet (over Home) | host device | "Schmegettes is invite-only", email field, **Email me a sign-in link** |
| Check-your-email sheet (over Home) | host device | Where it was sent, a 6-digit code field, **Resend**, **Use a different email** |
| Not-invited sheet (over Home) | host device | The address isn't invited; **Use a different email** |
| `/auth/link` | whichever browser opens the emailed link | Signs in, then goes to Home and continues to the name prompt |
| `/join/{code}` | phones | Unchanged |

## States of the host device

```text
anonymous ──Host a game──▶ entering email ──send──▶ waiting for link or code ──link tapped / code ok──▶ name ──▶ lobby (as today)
    ▲                          │    ▲                     │
    │                          │    └─Use a different─────┤
    │                          ▼          email           │
    │                     not invited ◀───────────────────┘ (invite removed before use)
    └───────────── Cancel / Back ──────────────────────────
signed in ──Sign out──▶ anonymous
```

## Flows

### First time hosting (invited host)

1. On Home, the host presses **Host a game**.
2. Email sheet:

```text
┌──────────────────────────────────────────┐
│  Schmegettes is invite-only               │
│  Enter the email you were invited with.   │
│                                           │
│  [ sam@example.com                     ]  │
│                                           │
│  [ Email me a sign-in link ]    Cancel    │
└──────────────────────────────────────────┘
```

3. Invited: the email is sent and the sheet changes:

```text
┌──────────────────────────────────────────┐
│  Check your email                         │
│  We sent a sign-in link to                │
│  sam@example.com. Open it on this iPhone, │
│  or type the code from the email.         │
│                                           │
│  Code  [ _ _ _ _ _ _ ]                    │
│                                           │
│  Resend (0:45)     Use a different email  │
└──────────────────────────────────────────┘
```

4. Either:
   - **Tap the link** in Mail. It opens in Safari, signs in, and lands on Home, which continues to the name prompt. If the original tab is still open on the check-your-email sheet, it moves on by itself.
   - **Type the code.** The sixth digit submits.
5. The usual "What's your name?" prompt, then the lobby ([lobby](../lobby/interaction-design.md#host-a-game-host-device)).

Later visits on that device skip steps 2–4.

### Not invited

Shown as soon as the host presses **Email me a sign-in link**. Nothing is sent.

```text
┌──────────────────────────────────────────┐
│  You're not on the invite list            │
│  sam@example.com can't host games.        │
│  Ask the person who invited you to add    │
│  this address. You can still join a game  │
│  with a code.                             │
│                                           │
│  [ Use a different email ]      Back      │
└──────────────────────────────────────────┘
```

### Join (phone)

Unchanged: code, then name, then the buzzer. No sign-in prompt ever appears on a phone that only joins.

## Edge cases

| Situation | What happens |
|---|---|
| Link opened in the mail app's built-in browser (Gmail, Outlook) | That browser gets signed in, not Safari. The host device is still on the check-your-email sheet: type the code. The email says so under the link: "On a different device or app? Use this code instead." |
| Link opened on another device (a laptop) | Same: that device is signed in, which is harmless. The host types the code on the iPhone. |
| Link or code expired (1 hour), already used, or replaced by a newer one | Link: a page says "This sign-in link has expired. Ask for a new one on the device you're hosting from." Code: "That code has expired. Resend?" |
| Wrong code | "That code didn't work." After 5 wrong tries: "Too many tries. Send a new code." |
| Email doesn't arrive | Under the code field: "Nothing yet? Check spam, or resend." **Resend** after 60 s. |
| Email typed with a typo | Not invited, so nothing is sent. The not-invited sheet shows the address so the typo is visible. |
| Invite removed after the email was sent | Sign-in completes, then the not-invited sheet. No room is created. |
| Invite removed while in the lobby | **Start** fails: "Your invite was removed, so you can't start games." The room stays open until it closes as usual. |
| Invite removed during a game | The game plays to the end. **Rematch** fails with the same message. |
| Not-invited user calls the API directly (create room, Start) | Refused by the server. Nothing is created and no clue is read. |
| Invited host joins someone else's room by code | Works like any contestant. The invite isn't needed or used. |
| The email already has an account from another device | This device switches to that account. Its own anonymous history stays behind ([feature brief](./feature-brief.md#signing-in-emailed-link)). |
| Lobby open at rollout with an uninvited host | Closed. Phones see "This room has closed." |
