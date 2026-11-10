# Accounts

## Why

Every player starts as an anonymous guest, and everything they have (game history, the clues they've seen, host access) belongs to that guest in one browser. Browsers lose guests often: Safari deletes a site's data after about 7 days without a visit, and private windows, a new phone, a different browser, or a link opened inside Messages or Instagram each start a new guest with nothing. For a party game played every few weeks, that means people regularly lose their history and hosts lose host access.

An account keeps all of it, on any device, and is what [stats and the leaderboard](../stats-and-leaderboard/feature-brief.md) are built on. Playing stays account-free: an account is something a guest can choose to add.

## Jobs to be done

| Who | Job |
|---|---|
| Contestant | "I can play tonight without signing up for anything." |
| Contestant | "After a game, one tap saves my history so it's still there next month, on any phone." |
| Contestant | "When I sign in on a new phone, tonight's games come with me." |
| Host | "I enter my host code once. After that, signing in on any device lets me host." |
| Signed-in player | "If I'm signed out, I'm told, and one tap gets my history back." |
| Signed-in player | "I can delete my account." |

## Rules

### Sign-in methods

- **Continue with Apple** and **Continue with Google**. Nothing else: no email sign-in, no passwords. Schmegettes still never sends email.
- A player can add the other method to the same account later (Account page), so either one works.
- We never show a player's email address anywhere, and never use it to contact them. "Hide My Email" on Apple is fine.

### Guests

- A guest is today's anonymous player. Guests can play, join, watch, and host (with a host code) exactly as today.
- Guests have no stats and aren't on the leaderboard ([stats and leaderboard](../stats-and-leaderboard/feature-brief.md)).

### Signing in keeps everything

There are two cases. The player sees the same thing in both.

| Case | What happens |
|---|---|
| **First sign-in** (this Apple or Google account has never been used here) | The guest **becomes** the account. Its history, seen clues, and host access stay as they are. |
| **Returning** (this Apple or Google account already has a Schmegettes account, e.g. a new phone) | The device switches to the existing account. Anything the guest on this device had (games, seen clues, host access) is **moved into the account**, then the guest is removed. |

- Moving a guest into an account never loses a game. If the guest and the account were in the **same game** (two devices, one person), the account's row is kept and the guest's row shows as "Former player" on that scoreboard.
- Host access is kept if either the guest or the account had it.
- A merge is the only time two identities combine. Two separate accounts (one made with Apple, one with Google) are never merged. Trying to add a Google account that already belongs to another Schmegettes account says: "That Google account is already used by another Schmegettes account."

### When you can sign in

- **Not while in a room** (lobby, game, or the end-of-game scoreboard). Signing in can switch the device to a different player, which would break the room. Sign-in is on Home, My games, Stats, and the Account page.
- **Never on the host device's TV view.** The host device is mirrored to the TV, so no sign-in prompt or account screen appears while it is hosting.

### The prompt to save history

- A **guest contestant** who leaves a room after playing at least one finished game sees a "Save your games" sheet on Home.
- **Not now** hides it for 7 days. It never appears for a signed-in player, a spectator, or a host device.
- My games and Stats show a quieter version (a line and a **Sign in** button) for guests, always.

### Staying signed in

- A signed-in player stays signed in on that device until they sign out. There's no expiry they would notice.
- If the browser deletes its data anyway (Safari's 7-day rule, cleared data), the device starts as a guest. Signing in again is one tap and brings everything back.
- **Never silent:** if a device that was signed in finds itself signed out (and can tell), Home says "You've been signed out. Sign in to get your games back." The player can still play as a guest.

### Host access

- Host access now belongs to the **player**: the guest, or the account once signed in ([private access](../private-access/feature-brief.md)).
- A signed-in host who gets a new phone signs in and can host. No new code.
- Host codes are still the only way to get host access. Signing in never grants it.
- Removing host access (admin) removes it from the account on every device.

### Names

- An account has a **name** (1–20 characters, same rule as room names). At first sign-in it's prefilled with the name this device used last.
- It prefills the name prompt when joining or hosting a room, and is the name on the [leaderboard](../stats-and-leaderboard/feature-brief.md). The player can still use a different name in a room; old scoreboards keep the name used in that game.
- Names don't have to be unique.

### Signing out

- Account page → **Sign out** → confirm. The device becomes a new guest with no history and no host access (both stay with the account).

### Deleting an account

- Account page → **Delete account** → confirm. Takes effect at once and can't be undone.
- Follows the existing rule ([game history](../game-history/feature-brief.md#accounts-and-deletion)): their results stay on other players' scoreboards as "Former player", their seen clues and stats are deleted, they leave the leaderboard, and host access is removed. The device becomes a new guest.

## Decisions (2026-11-10)

**Apple and Google sign-in, accounts optional** (owner's choice). This changes the 2026-11-09 private-access decision "Host codes, not email or Google":

| Option | For | Against |
|---|---|---|
| **A. Apple + Google (chosen)** | One tap on iPhone and Android; no email provider or passwords to run; nothing for us to phish | Needs Apple and Google developer setup; Google sign-in doesn't work inside some in-app browsers |
| B. A recovery code, like host codes | No sign-in service at all | A lost code is a lost account, and people lose codes |
| C. Email magic link | Works for everyone | Needs an email provider; emails can be phished or land in spam |

| Option | For | Against |
|---|---|---|
| **Optional, prompted (chosen)** | Keeps "no account required to play" | Guests who never sign in still lose history |
| Required for hosts only | Hosting survives a lost browser | Hosts must sign in to keep hosting at all |
| Required for everyone | Simplest stats | Everyone at a party must sign in before joining |

What hasn't changed: hosting still needs a host code, joining still needs only the room code, and the site stays unlisted.

## Out of scope

- Email or password sign-in, and any email from Schmegettes
- Merging two existing accounts
- Profile pictures
- An admin screen for accounts
- Seeing or managing other devices signed in to the account
- Recovering a guest whose browser data was lost before they signed in
