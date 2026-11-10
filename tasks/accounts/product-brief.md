---
jira-type: new-feature
jira-title: "Accounts: email and password sign-in to keep history and hosting"
---
**Task Type:** New Feature. A net-new player-facing capability (accounts, sign-in, an Account page), not an addition to one existing feature.

**Changed 2026-11-10 (owner's choice):** email and password with confirmation off, replacing Apple and Google sign-in. PR #108 is open with Apple and Google and gets reworked; the server side (merge tickets, merge, delete) stays as built.

**Product docs:** `docs/product-docs/features/accounts/feature-brief.md` and `interaction-design.md`. Also changed: `architecture/product-overview.md` (principle), `features/private-access/feature-brief.md` (host access belongs to the player; 2026-11-10 decision change), `features/game-history/` (sign-in wording).

**Problem:** Every player is an anonymous guest whose history, seen clues, and host access live in one browser. Safari's 7-day storage deletion, private windows, new phones, other browsers, and in-app browsers each start a new empty guest, and the app switches silently. Players lose their games and hosts lose host access, with no way back.

**Outcomes:**
- A player who creates an account with an email and password keeps their history, seen clues, and host access on every device.
- Creating an account or signing in never loses a game: creating keeps the guest's data; signing in moves this device's guest data into the account.
- Playing still needs no account. Nothing is ever emailed, and no outside service or paid account is needed.
- A signed-in player who gets signed out is told, and signing in gets everything back.

**Player flow:**
- **Sign in** on Home (top right), My games, Stats, and the host code sheet; a "Save your games" sheet on Home after a guest contestant leaves a room with a finished game (opens on Create account; **Not now** hides it 7 days). Never inside a room, and never on the host device while it is hosting (it is on the TV).
- Sheet with **Sign in** and **Create account**: email and password (at least 8 characters, **Show** toggle, no confirm field), marked for password managers. Create account then asks for a name (prefilled, 1–20 characters). Toasts: "Account created. Your games are saved.", "Signed in. Added 3 games from this phone.", or "Signed in." No redirect: the player stays on the page.
- **Forgot password?** → "Ask the person who runs Schmegettes to reset your password." The admin sets a new one in the Supabase dashboard.
- **Account page** (`/account`): name (Edit), email (shown only to its owner; can't be changed), **Change password** (current + new), Sign out (confirm; this device becomes a fresh guest), Delete account (confirm; "Former player" on old scoreboards; refused mid-game).
- **Signed out unexpectedly:** Home banner "You've been signed out. Sign in to get your games back."
- Messages: wrong email or password → "That email and password don't match." (one message for both); an email that already has an account → "That email already has an account. Sign in instead."; too many tries → "Too many tries. Wait a few minutes and try again."
- Edge cases (full list in interaction-design.md): a merge that fails partway moves nothing and is retried on the next load; guest and account in the same game → account's row kept, guest's row becomes "Former player"; someone registered my email → the admin deletes that account.

**Success Criteria:**
- A guest with games creates an account; on a second browser they sign in with the same email and password and see the same games in My games and can host without a code.
- A guest on browser B plays a game, then signs in to an existing account: that game appears in the account's My games, and the guest no longer exists.
- Host access held by the guest or the account is kept after any sign-in; removing it in the database removes it on every device.
- No sign-in UI or password field appears in a lobby, game, end-of-game scoreboard, or on a hosting device.
- Signing out leaves a guest with no history; signing back in restores everything.
- Changing the password needs the current one; the old password stops working.
- Deleting an account shows "Former player" on other players' scoreboards, removes host access, and frees the email.
- No email is ever sent. No email address is shown to anyone but its owner, or logged.

**Out of scope:** password resets by email, email confirmation, or any email from Schmegettes; Apple, Google, text messages, or sign-in links; changing the account's email; merging two existing accounts; profile pictures; an admin screen; managing other signed-in devices or signing out everywhere; recovering a guest lost before signing in; stats, the leaderboard, and the Account page's "Show me on the leaderboard" switch (next task, `stats-and-leaderboard`).
