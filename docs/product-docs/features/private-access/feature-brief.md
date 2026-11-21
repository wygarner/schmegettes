# Private Access

Built in `supabase/migrations/*_private_access.sql` (codes, hosts, and the checks in `create_room` and `start_game`) and `*_host_code_rotation.sql` (the rotating code, the admin list, the admin functions), `api/internal/hostaccess`, `api/internal/admin`, and `api/internal/ratelimit`, `game/internal/room` (Start and Rematch), `web/src/pages/HostCodeSheet.tsx`, and `devtools/src/admin/` (the admin page). **Not yet implemented** (task `in-app-host-code`): the [admin screen in the app](#admin-screen-in-the-app).

## Why

Our clues come from a dataset we can use only privately ([clue catalog](../clue-catalog/feature-brief.md#source)). So Schmegettes is private: only people we invite can run a game. A party still has to be easy, so the people on the couch don't need accounts.

## Jobs to be done

| Who | Job |
|---|---|
| Admin (us) | "I open the admin page, read today's host code, and tell it to whoever I'm inviting. It stops working on its own within the hour." |
| Admin (us) | "At a party, I open Schmegettes on my phone, read the host code and tell it to a guest. No laptop." |
| Admin (us) | "I see who has host access and take it away from anyone." |
| Admin (us) | "If a code gets passed around, I kill it right away." |
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
- **One code at a time, rotating every 45 minutes.** Each environment has exactly one current code. It changes on a fixed 45-minute clock (12:00, 12:45, 13:30, …, UTC) without anyone doing anything.
- **Anyone can use the current code while it's current.** Three people invited for the same party all type the same code. Each one who enters it gets host access and is recorded as a host, separately.
- **Grace period: 5 minutes.** The previous code still works for 5 minutes after it rotates, so a code read out at 12:44 works at 12:47. After that: "That code didn't work."
- **Rotate now.** The admin can retire the current code at any moment (say it was posted somewhere). A new code starts at once and the old one stops working immediately, with no grace period. The 45-minute clock carries on from there.
- The admin reads the current code on the [admin screen in the app](#admin-screen-in-the-app) or the [admin page](#admin-page-devtools), and tells it to the person (in person or by message).
- A wrong or expired code: "That code didn't work." After 5 tries in a minute: "Too many tries. Wait a minute and try again."
- A device that can already host is never asked for a code. Rotation never takes host access away; only the admin removes it.

### Admin page (devtools)

- **Who:** only accounts on the environment's **admin list**. Guests are never admins, and signing up doesn't make anyone one. The owner adds the first admin once per environment in the Supabase SQL editor.
- **Where:** a page in devtools, which runs only on the admin's own computer and is never deployed. The page picks an environment (local, staging, production) and the admin signs in with their Schmegettes email and password for that environment. No database password or service key is ever on the computer.
- **What it shows and does:**
  - The current code, how long until it rotates, and **Rotate now**.
  - Every host: account email (or "Guest" with the name they last played as), when they got access, and an optional note ("Sam, Thursday trivia"). The admin can add or edit the note.
  - **Remove** on each host: takes host access away (same effect as before: next create, Start, or Rematch is refused; a game in progress plays to the end).
- **Anyone else** who calls the admin API (a player, a guest, a signed-out visitor) gets the same answer as for a page that doesn't exist. The admin API is rate-limited like the host-code check.

### Admin screen in the app

The admin page needs a laptop with devtools. The admin screen is the part of it an admin needs away from one: the code.

- **Who:** the same admin list, signed in to the web app with their account, on the environment that app runs on (staging's app shows staging's code). Guests and every other account never see it.
- **Where:** an **Admin** row on Home, under Stats, shown only to an admin. It opens `/admin`. Anyone else who opens `/admin` sees Home, as for a page that doesn't exist.
- **What it shows and does:**
  - The current host code, **hidden until tapped**: the admin's phone may be the host device, mirrored to the TV, and a code on the TV is a code for the whole room. **Show** reveals it; leaving the screen hides it again.
  - **Copy**, which works without showing the code.
  - When it changes, and until when the previous code still works, as on the admin page.
  - **Rotate now**, with the same confirmation and effect as on the admin page.
- **Not here:** the hosts list, notes, Remove, and service notices. They stay on the devtools admin page.
- It uses the same admin API and the same checks as the admin page. The api surface doesn't change; only the web app gains a screen.

### Host access belongs to the player

- Entering a code gives host access to whoever the device is playing as: the guest, or the signed-in account ([accounts](../accounts/feature-brief.md)). History and seen clues are unchanged.
- A signed-in host can host from any device they sign in on. When a guest with host access signs in, the access moves to the account.
- A guest host who clears the browser's data, or switches device or browser, loses host access and asks the admin for the current code. Signing in first avoids this.
- Signing in never grants host access; only a code does.
- **Removing host access**: the admin removes the host on the admin page. It takes effect at the next create, Start, or Rematch. A game already in progress plays to the end.

### Decisions (2026-11-09)

**Invite-only hosting, open joining** (confirmed by the owner):

| Option | For | Against |
|---|---|---|
| **A. Invite-only hosting, open joining (chosen)** | One step per host. Guests join as today. Clue text never leaves a host device. | Someone with a live room code can join an open room and see category names |
| B. Everyone needs an invite | Tightest | Every guest at a party needs an invite, which breaks drop-in play |
| C. One shared password to host | No accounts | It leaks, one person can't be removed, and there's no record of who hosted |

**Host codes, not email or Google** (owner's choice): nothing is ever emailed, there's no email provider or sign-in service to set up, and there's nothing to phish. The cost: host access is per device, and a lost browser means a new code.

> **Changed 2026-11-10** (owner's choice): players can now create an account with an email and password ([accounts](../accounts/feature-brief.md#decisions-2026-11-10)), so host access follows a signed-in host to any device. Host codes are still the only way to get host access, and nothing is ever emailed: email confirmation is off and there is no password-reset email.

### Decisions (2026-11-17)

**Rotating codes replace one-use codes** (owner's choice). Inviting several people meant creating one code per person in SQL; one rotating code covers a whole party.

| Option | For | Against |
|---|---|---|
| A. One-use codes (until now) | A code reaches exactly one person | One code per invitee, made by hand |
| **B. One shared code, rotating every 45 min (chosen)** | Nothing to create; a party's hosts all use one code; a leaked code dies within the hour, or at once with Rotate now | Within its window, a forwarded code works for whoever receives it |
| C. Rotating code, one use per window | Leak-proof per window | Back to one person per window; a second invitee waits up to 45 min |

This is not the "one shared password" rejected on 2026-11-09 (option C there): the code expires on its own, and every person who uses it is still a separate host the admin can see and remove.

**5-minute grace period** (default, owner may change): a code read out just before it rotates still works when it's typed. Rotate now has no grace, because it's for a code that must stop working.

**Admin page in devtools, through the api** (owner's choice): the admin signs in as a normal account on the admin list; the api checks the list on every admin request. Rejected: reading codes with the database owner password on a laptop (the docs forbid owner credentials on a laptop), and an admin page in the public web app (one more public surface). Changed 2026-11-21 for the code and Rotate now only ([decisions](#decisions-2026-11-21)).

### Decisions (2026-11-21)

**The host code in the app** (owner's choice, from QA): reverses the 2026-11-17 "admin page only in devtools" rule for the code alone.

| Option | For | Against |
|---|---|---|
| **A. Code and Rotate now in the app, the rest in devtools (chosen)** | Hand out a code from your phone at a party; kill a leaked one from anywhere | The web app bundles an admin screen; a mirrored phone could show the code on the TV (hidden until tapped) |
| B. Code only in the app | Smallest addition | A leaked code still needs the laptop to kill |
| C. Keep everything in devtools | No new public screen | Needs a laptop to invite anyone |

### Staying unlisted

- Every page asks search engines not to index it.
- No public landing page, sign-up, or "request an invite" form.

### Rollout

- Lobbies opened before the release can't Start. They close after 30 minutes idle, as usual. (Owner approved: nobody plays in production yet.)
- The release creates the first host code. Until the admin gives it out, nobody can host.
- **When rotating codes ship:** any unused one-use code stops working. Everyone who already has host access keeps it. The owner adds themselves to the admin list in each environment before the release.
- **Production loads the real clue catalog only after this is live** ([clue catalog](../clue-catalog/feature-brief.md#source)).

## Out of scope

- The hosts list, notes and Remove in the web app (they stay on the devtools admin page)
- Several codes at once, or a code per invitee
- Changing the 45-minute period without a release
- Any email from Schmegettes (accounts use email and password with confirmation off: [accounts](../accounts/feature-brief.md))
- Moving a guest's host access to another device without signing in or a new code
- Hosts inviting other hosts
- Limits per host (rooms per day, players per room)
- Hosting from a phone while a separate screen shows the TV view
