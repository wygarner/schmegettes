# Private Access

> **Not yet implemented.** Today anyone who opens the site can host: the device signs in anonymously and creates a room.

## Why

Our clues come from a dataset we can use only privately ([clue catalog](../clue-catalog/feature-brief.md#source)). So Schmegettes is private: only people we invite can run a game. A party still has to be easy, so the people on the couch don't need accounts.

## Jobs to be done

| Who | Job |
|---|---|
| Admin (us) | "I decide who can host, by email, and I can take it back." |
| Invited host | "I sign in once on my iPhone, then host exactly as before." |
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
- The host signs in with **Google** on the host device. The account's email must match an invite (case-insensitive).
- Signing in **links** the device's anonymous account, so its history and seen clues are kept ([game history](../game-history/feature-brief.md#accounts-and-deletion)). If that Google account was already used on another device, this device switches to it, and the anonymous history from this device is not merged.
- A host stays signed in on that device until they sign out (a link on Home).
- **Removing an invite** takes effect at the next create, Start, or Rematch. A game already in progress plays to the end.

### Decision: invite-only hosting (2026-11-09)

| Option | For | Against |
|---|---|---|
| **A. Invite-only hosting, open joining (chosen)** | One sign-in per host. Guests join as today. Clue text never leaves an invited device. | Someone with a live code can join an open room and see category names |
| B. Everyone signs in with an invite | Tightest | Every guest at a party needs an invited account, which breaks drop-in play |
| C. One shared password to host | No accounts | It leaks, one person can't be removed, and there's no record of who hosted |

### Staying unlisted

- Every page asks search engines not to index it.
- No public landing page, sign-up, or "request an invite" form.

### Rollout

- When this ships, open lobbies whose host isn't invited are closed ("This room has closed."). Games in progress finish.
- **Production loads the real clue catalog only after this is live** ([clue catalog](../clue-catalog/feature-brief.md#source)).

## Out of scope

- An invite or admin screen; inviting by link
- Sign-in methods other than Google (email link is a candidate if an invitee has no Google account)
- Accounts for contestants, or contestant sign-in to keep history across devices
- Limits per invite (rooms per day, players per room)
- Hosting from a phone while a separate screen shows the TV view
