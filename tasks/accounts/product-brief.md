---
jira-type: new-feature
jira-title: "Accounts: sign in with Apple or Google to keep history and hosting"
---
**Task Type:** New Feature. A net-new player-facing capability (accounts, sign-in, an Account page), not an addition to one existing feature.

**Product docs:** `docs/product-docs/features/accounts/feature-brief.md` and `interaction-design.md`. Also changed: `architecture/product-overview.md` (principle), `features/private-access/feature-brief.md` (host access belongs to the player; 2026-11-10 decision change), `features/game-history/` (sign-in wording).

**Problem:** Every player is an anonymous guest whose history, seen clues, and host access live in one browser. Safari's 7-day storage deletion, private windows, new phones, other browsers, and in-app browsers each start a new empty guest, and the app switches silently. Players lose their games and hosts lose host access, with no way back.

**Outcomes:**
- A player who signs in with Apple or Google keeps their history, seen clues, and host access on every device.
- Signing in never loses a game: a first sign-in keeps the guest's data; a returning sign-in moves this device's guest data into the account.
- Playing still needs no account.
- A signed-in player who gets signed out is told, and gets everything back in one tap.

**Player flow:**
- **Sign in** on Home (top right), My games, Stats, and the host code sheet; a "Save your games" sheet on Home after a guest contestant leaves a room with a finished game (**Not now** hides it 7 days). Never inside a room, and never on the host device while it is hosting (it is on the TV).
- Sheet: **Continue with Apple** / **Continue with Google**. First sign-in asks for a name (prefilled, 1–20 characters). Toast on return: "Signed in. Your games are saved." or "Signed in. Added 3 games from this phone."
- **Account page** (`/account`): name (Edit), Apple and Google (Connect the other), Sign out (confirm; device becomes a fresh guest), Delete account (confirm; existing deletion rule: "Former player" on old scoreboards).
- **Signed out unexpectedly:** Home banner "You've been signed out. Sign in to get your games back."
- Edge cases (full list in interaction-design.md): Google blocked in an in-app browser → "Open Schmegettes in Safari or Chrome" with Copy link; a merge that fails partway moves nothing and retries at next sign-in; guest and account in the same game → account's row kept, guest's row becomes "Former player"; connecting a provider that belongs to another account → refused with a message; cancelling at Apple/Google → back to the sheet, no message.

**Success Criteria:**
- A guest with games signs in with Apple; on a second phone they sign in with Apple and see the same games in My games and can host without a code.
- A guest on phone B plays a game, then signs in to an existing account: that game appears in the account's My games, and the guest no longer exists.
- Host access held by the guest or the account is kept after any sign-in; removing it in the database removes it on every device.
- No sign-in UI appears in a lobby, game, end-of-game scoreboard, or on a hosting device.
- Signing out leaves a guest with no history; signing back in restores everything.
- Deleting an account shows "Former player" on other players' scoreboards and removes host access.
- No email is sent and no email address is shown or logged.

**Out of scope:** email or password sign-in; any email from Schmegettes; merging two existing accounts; profile pictures; an admin screen; managing other signed-in devices; recovering a guest lost before signing in; stats, the leaderboard, and the Account page's "Show me on the leaderboard" switch (next task, `stats-and-leaderboard`).
