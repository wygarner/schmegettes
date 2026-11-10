# Accounts

## Why

Every player starts as an anonymous guest, and everything they have (game history, the clues they've seen, host access) belongs to that guest in one browser. Browsers lose guests often: Safari deletes a site's data after about 7 days without a visit, and private windows, a new phone, a different browser, or a link opened inside Messages or Instagram each start a new guest with nothing. For a party game played every few weeks, that means people regularly lose their history and hosts lose host access.

An account keeps all of it, on any device, and is what [stats and the leaderboard](../stats-and-leaderboard/feature-brief.md) are built on. Playing stays account-free: an account is something a guest can choose to add.

## Jobs to be done

| Who | Job |
|---|---|
| Contestant | "I can play tonight without signing up for anything." |
| Contestant | "After a game, I create an account with my email and a password, and my history is still there next month, on any phone." |
| Contestant | "When I sign in on a new phone, tonight's games come with me." |
| Host | "I enter my host code once. After that, signing in on any device lets me host." |
| Signed-in player | "If I'm signed out, I'm told, and signing in gets my history back." |
| Signed-in player | "I can change my password and delete my account." |
| Admin (us) | "When someone forgets their password, I can set a new one for them." |

## Rules

### Signing in

- **Email and password**, handled by Supabase Auth. Nothing else: no Apple, Google, text messages, or sign-in links.
- **Schmegettes never sends email.** Email confirmation is off, so an account works the moment it's created. The email address is only the player's username.
- **Create account:** email and a password of **at least 8 characters**. No other password rules (no required symbols or digits); phones' password managers can suggest a strong one.
- **Sign in:** email and password. A wrong email or password gets one message for both: "That email and password don't match."
- **Creating an account with an email that already has one** says "That email already has an account. Sign in instead." This tells a stranger the address is registered; for a private game that's acceptable.
- Email addresses ignore case (`Sam@x.com` and `sam@x.com` are the same account). A typo in the email is not caught: the misspelled address simply becomes the username. The Account page shows it so the player can see what they typed.
- We never show a player's email to anyone else, never use it to contact them, and never put it in logs.

### Forgotten passwords

- There is **no self-service reset**: a reset needs an email, and we send none.
- **Forgot password?** on the sign-in sheet says: "Ask the person who runs Schmegettes to reset it." The admin sets a new password in the Supabase dashboard and tells the player in person or by message.
- The player can change it afterwards on the Account page.

### Guests

- A guest is today's anonymous player. Guests can play, join, watch, and host (with a host code) exactly as today.
- Guests have no stats and aren't on the leaderboard ([stats and leaderboard](../stats-and-leaderboard/feature-brief.md)).

### Signing in keeps everything

There are two cases. The player sees the same thing in both.

| Case | What happens |
|---|---|
| **Create account** | The guest **becomes** the account. Its history, seen clues, and host access stay as they are. |
| **Sign in** to an existing account (e.g. a new phone) | The device switches to the account. Anything the guest on this device had (games, seen clues, host access) is **moved into the account**, then the guest is removed. |

- Moving a guest into an account never loses a game. If the guest and the account were in the **same game** (two devices, one person), the account's row is kept and the guest's row shows as "Former player" on that scoreboard.
- Host access is kept if either the guest or the account had it.
- Two separate accounts (two email addresses) are never merged.

### When you can sign in

- **Not while in a room** (lobby, game, or the end-of-game scoreboard). Signing in can switch the device to a different player, which would break the room. Sign-in is on Home, My games, Stats, the host code sheet, and the Account page.
- **Never on the host device's TV view.** The host device is mirrored to the TV, so no sign-in prompt, account screen, or password field appears while it is hosting.

### The prompt to save history

- A **guest contestant** who leaves a room after playing at least one finished game sees a "Save your games" sheet on Home.
- **Not now** hides it for 7 days. It never appears for a signed-in player, a spectator, or a host device.
- My games and Stats show a quieter version (a line and a **Sign in** button) for guests, always.

### Staying signed in

- A signed-in player stays signed in on that device until they sign out. There's no expiry they would notice.
- If the browser deletes its data anyway (Safari's 7-day rule, cleared data), the device starts as a guest. Signing in again brings everything back; a password manager makes it quick.
- **Never silent:** if a device that was signed in finds itself signed out (and can tell), Home says "You've been signed out. Sign in to get your games back." The player can still play as a guest.

### Host access

- Host access belongs to the **player**: the guest, or the account once signed in ([private access](../private-access/feature-brief.md)).
- A signed-in host who gets a new phone signs in and can host. No new code.
- Host codes are still the only way to get host access. Signing in never grants it.
- Removing host access (admin) removes it from the account on every device.

### Names

- An account has a **name** (1–20 characters, same rule as room names). Right after creating an account, it's asked for, prefilled with the name this device used last.
- It prefills the name prompt when joining or hosting a room, and is the name on the [leaderboard](../stats-and-leaderboard/feature-brief.md). The player can still use a different name in a room; old scoreboards keep the name used in that game.
- Names don't have to be unique. The email is never used as a name.

### Changing the password

- Account page → **Change password**: the current password, then a new one (at least 8 characters). Asking for the current one stops someone holding an unlocked, signed-in phone from taking the account.
- Other devices signed in to the account stay signed in.

### Signing out

- Account page → **Sign out** → confirm. The device becomes a new guest with no history and no host access (both stay with the account). Other devices stay signed in.

### Deleting an account

- Account page → **Delete account** → confirm. Takes effect at once and can't be undone.
- Follows the existing rule ([game history](../game-history/feature-brief.md#accounts-and-deletion)): their results stay on other players' scoreboards as "Former player", their seen clues and stats are deleted, they leave the leaderboard, and host access is removed. The email address is free to use again. The device becomes a new guest.
- Refused while the player is in a game in progress: "Finish or leave your game first."

### Admin

In the Supabase dashboard (no admin screen):

- **Reset a password:** find the user by email and set a new password.
- **Free up an email** someone else registered: delete that account (it follows the deletion rule above).

## Decisions (2026-11-10)

**Email and password, confirmation off** (owner's choice, replacing Apple and Google sign-in chosen earlier the same day). The owner doesn't want to pay for developer accounts or run an email or SMS service.

| Option | For | Against |
|---|---|---|
| Apple + Google | One tap; no passwords; providers handle forgotten sign-ins | Apple needs a paid developer account and a secret renewed every 6 months; Google is blocked in some in-app browsers |
| Text-message codes | No redirect; works in every browser | Every text costs money; SMS fraud; an SMS provider and sender registration |
| Email codes | No passwords | Needs an email provider and a domain; codes land in spam |
| **Email + password, no confirmation (chosen)** | No outside service, no cost; works in every browser; password managers fill it in | No self-service reset (the admin resets by hand); nobody proves they own the email, so someone could register yours; password reuse |

| Option | For | Against |
|---|---|---|
| **Optional, prompted (chosen)** | Keeps "no account required to play" | Guests who never sign in still lose history |
| Required for hosts only | Hosting survives a lost browser | Hosts must sign in to keep hosting at all |
| Required for everyone | Simplest stats | Everyone at a party must sign in before joining |

What hasn't changed: hosting still needs a host code, joining still needs only the room code, nothing is ever emailed, and the site stays unlisted.

Later, if lost passwords become a real problem: add a free email provider only for password resets. That's a new decision, not part of this feature.

## Out of scope

- Password resets by email, email confirmation, or any email from Schmegettes
- Apple, Google, or other sign-in providers; text messages; sign-in links
- Changing the account's email address
- Merging two existing accounts
- Profile pictures
- An admin screen for accounts
- Seeing or managing other devices signed in to the account; signing out everywhere
- Recovering a guest whose browser data was lost before they signed in
