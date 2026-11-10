# Private Access

Built in `supabase/migrations/*_private_access.sql` (codes, hosts, and the checks in `create_room` and `start_game`), `api/internal/hostaccess` and `api/internal/ratelimit`, `game/internal/room` (Start and Rematch), and `web/src/pages/HostCodeSheet.tsx`.

## Why

Our clues come from a dataset we can use only privately ([clue catalog](../clue-catalog/feature-brief.md#source)). So Schmegettes is private: only people we invite can run a game. A party still has to be easy, so the people on the couch don't need accounts.

## Jobs to be done

| Who | Job |
|---|---|
| Admin (us) | "I give someone a host code. Once they use it, it's spent, and a fresh code is waiting for the next person." |
| Admin (us) | "I can take hosting away from someone." |
| Invited host | "I type my code once on my iPhone, then host exactly as before." |
| Contestant | "I join with the code on the TV, as before. No account, no invite." |
| Someone who finds the site | "I can't start a game or see a single clue." |

## Rules

### Who can host

- **Hosting needs host access**: creating a room, **Start**, and **Rematch**. Each is checked on the server at that moment.
- **Joining doesn't.** Contestants and spectators join with the room code, anonymously, as today.
- Why joining can stay open: phones never receive clue text or responses ([product overview](../../architecture/product-overview.md), Principles). Clues appear only on the host device. A phone sees category names and values. The room code is shown only on the TV, so joining means being in the room. Guessing a room code is limited by the join rate limits.
- **My games** is unchanged: players see the games they were in.

### Host codes

- A **host code** is 8 characters from the room-code alphabet (no look-alikes `0 O 1 I L`), shown in two groups: `K7RX-M2PQ`. Typing ignores case, spaces, and the dash.
- **One use.** The first device to enter a code gets host access, and the code is spent at once. A **new unused code** is created at the same moment, so there's always one waiting for the next person.
- The admin reads the waiting code from the database and gives it to one person (in person or by message). They can note who it's for. To invite several people at once, the admin creates extra codes.
- A wrong or spent code: "That code didn't work." After 5 tries in a minute: "Too many tries. Wait a minute and try again."
- A device that can already host is never asked for a code.

**Admin, in the Supabase SQL editor:**

```sql
select code, note from public.host_codes where used_at is null;      -- the waiting code(s)
select private.new_host_code('for Sam');                              -- an extra code
delete from public.hosts where code = 'K7RXM2PQ';                     -- remove that person's host access
```

### Host access belongs to the player

- Entering a code gives host access to whoever the device is playing as: the guest, or the signed-in account ([accounts](../accounts/feature-brief.md)). History and seen clues are unchanged.
- A signed-in host can host from any device they sign in on. When a guest with host access signs in, the access moves to the account.
- A guest host who clears the browser's data, or switches device or browser, loses host access and asks the admin for a new code. Signing in first avoids this.
- Signing in never grants host access; only a code does.
- **Removing host access**: the admin deletes the host (found by the code they used). It takes effect at the next create, Start, or Rematch. A game already in progress plays to the end.

### Decisions (2026-11-09)

**Invite-only hosting, open joining** (confirmed by the owner):

| Option | For | Against |
|---|---|---|
| **A. Invite-only hosting, open joining (chosen)** | One step per host. Guests join as today. Clue text never leaves a host device. | Someone with a live room code can join an open room and see category names |
| B. Everyone needs an invite | Tightest | Every guest at a party needs an invite, which breaks drop-in play |
| C. One shared password to host | No accounts | It leaks, one person can't be removed, and there's no record of who hosted |

**Host codes, not email or Google** (owner's choice): nothing is ever emailed, there's no email provider or sign-in service to set up, and there's nothing to phish. The cost: host access is per device, and a lost browser means a new code.

> **Changed 2026-11-10** (owner's choice): players can now sign in with Apple or Google ([accounts](../accounts/feature-brief.md#decisions-2026-11-10)), so host access follows a signed-in host to any device. Host codes are still the only way to get host access, and nothing is ever emailed.

### Staying unlisted

- Every page asks search engines not to index it.
- No public landing page, sign-up, or "request an invite" form.

### Rollout

- Lobbies opened before the release can't Start. They close after 30 minutes idle, as usual. (Owner approved: nobody plays in production yet.)
- The release creates the first host code. Until the admin gives it out, nobody can host.
- **Production loads the real clue catalog only after this is live** ([clue catalog](../clue-catalog/feature-brief.md#source)).

## Out of scope

- An admin screen for codes and hosts
- Email or password sign-in (Apple and Google sign-in are in [accounts](../accounts/feature-brief.md))
- Moving a guest's host access to another device without signing in or a new code
- Hosts inviting other hosts
- Limits per host (rooms per day, players per room)
- Hosting from a phone while a separate screen shows the TV view
