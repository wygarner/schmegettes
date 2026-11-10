# Private Access

> **Not yet implemented.** Today anyone who opens the site can host: the device signs in anonymously and creates a room.

## Why

Our clues come from a dataset we can use only privately ([clue catalog](../clue-catalog/feature-brief.md#source)). So Schmegettes is private: only people we invite can run a game. A party still has to be easy, so the people on the couch don't need accounts.

## Jobs to be done

| Who | Job |
|---|---|
| Admin (us) | "I decide who can host, by email, and I can take it back." |
| Invited host | "I sign in once on my iPhone with my email, then host exactly as before." |
| Contestant | "I join with the code on the TV, as before. No account, no invite." |
| Someone who finds the site | "I can't start a game or see a single clue." |

## Rules

### Who needs an invite

- **Hosting needs an invite**: creating a room, **Start**, and **Rematch**. Each is checked on the server at that moment.
- **Joining doesn't.** Contestants and spectators join with the code, anonymously, as today.
- Why joining can stay open: phones never receive clue text or responses ([product overview](../../architecture/product-overview.md), Principles). Clues appear only on the host device, which is signed in with an invite. A phone sees category names and values. The code is shown only on the TV, so joining means being in the room. Guessing a code is limited by the join rate limits.
- **My games** is unchanged: players see the games they were in.

### Invites

- An invite is an **email address**. The admin adds and removes invites directly in the database. There is no invite screen.
- Matching ignores case and surrounding spaces (`Sam@Example.com ` matches `sam@example.com`).
- **Removing an invite** takes effect at the next create, Start, or Rematch. A game already in progress plays to the end.

### Signing in: emailed link

- On the host device, the host types their email. We email them a **sign-in link**. Tapping it signs in the browser that opens it.
- The same email carries a **6-digit code**. Typing it on the host device signs in too. The code covers the cases where the link opens somewhere else: another device, or the mail app's built-in browser, which doesn't share Safari's sign-in.
- **Only invited addresses get an email.** An address that isn't on the list is told so on the spot, and nothing is sent. The tradeoff: someone could check whether an address is invited. That's acceptable for a private game, and it means we never email strangers.
- A link or code works **once**, expires after **1 hour**, and is replaced by a newer one. **Resend** is available after 60 s.
- Signing in **links** the device's anonymous account, so its history and seen clues are kept ([game history](../game-history/feature-brief.md#accounts-and-deletion)). If that email already belongs to an account from another device, this device switches to it, and the anonymous history from this device is not merged.
- A host stays signed in on that device until they sign out (a link on Home).

### Decisions (2026-11-09)

**Invite-only hosting, open joining** (confirmed by the owner):

| Option | For | Against |
|---|---|---|
| **A. Invite-only hosting, open joining (chosen)** | One sign-in per host. Guests join as today. Clue text never leaves an invited device. | Someone with a live code can join an open room and see category names |
| B. Everyone signs in with an invite | Tightest | Every guest at a party needs an invited account, which breaks drop-in play |
| C. One shared password to host | No accounts | It leaks, one person can't be removed, and there's no record of who hosted |

**Emailed link, not Google** (owner's choice): every invitee has an email address, there's no third-party sign-in to set up, and there are no passwords. The costs: a trip to the inbox the first time, and we need a dependable email sender.

### Staying unlisted

- Every page asks search engines not to index it.
- No public landing page, sign-up, or "request an invite" form.

### Rollout

- When this ships, open lobbies whose host isn't invited are closed ("This room has closed."). Games in progress finish.
- **Production loads the real clue catalog only after this is live** ([clue catalog](../clue-catalog/feature-brief.md#source)).

## Out of scope

- An invite or admin screen; inviting by link
- Other sign-in methods: Google, Apple, passwords (Google could be added later)
- Accounts for contestants, or contestant sign-in to keep history across devices
- Limits per invite (rooms per day, players per room)
- Hosting from a phone while a separate screen shows the TV view
