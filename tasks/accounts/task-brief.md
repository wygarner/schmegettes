---
jira-type: new-feature
jira-title: "Accounts: email and password sign-in to keep history and hosting"
---
# Accounts: task spec (revised 2026-11-10: email and password)

Product brief: `tasks/accounts/product-brief.md`. Product docs: `docs/product-docs/features/accounts/` (feature brief and interaction design). Those docs are the source of truth for copy and screens; this spec covers how to build it.

**Revision:** the owner replaced Apple and Google sign-in with Supabase **email and password, confirmation off**. PR #108 (`new-feature/accounts-impl`) already built the first version. This spec says what stays, what goes, and what's new; the rework lands in #108.

## Approach

**Every sign-in moves the guest into the account** (unchanged). While still a guest, the device gets a one-use **merge ticket** from the api. It then creates an account (`supabase.auth.signUp`) or signs in (`supabase.auth.signInWithPassword`), and redeems the ticket as the account. One Postgres function moves the guest's games, seen clues, and host access into the account and deletes the guest.

- **No redirect any more.** Sign-in finishes inside the sheet, so the sheet redeems the ticket, asks a new account for its name, and shows the toast itself. The on-load retry stays for merges that failed (ticket kept in `localStorage`, valid 24 h).
- **Nothing is ever emailed.** `[auth.email] enable_confirmations = false`: `signUp` returns a session at once. No SMTP, no OAuth providers, no developer accounts.
- The api never sees or returns an email address. The Account page reads the owner's email from the client session (`session.user.email`).
- **No sign-in inside a room** (unchanged): entry points are Home, My games, the host code sheet, and Account. The server still refuses merging or deleting mid-game (`409`).

## What stays from #108 (no change)

- `shared/openapi.yaml`: the `/v1/me` routes, `Profile.accountName`, `MergeTicket`, `MergeResult`, and the generated code.
- Migration `supabase/migrations/20261110180920_accounts.sql` and `supabase/tests/accounts.test.sql`: `account_name`, `private.merge_tickets`, `set_account_name`, `create_merge_ticket`, `merge_guest`, `delete_account`. These functions don't care how the account signed in.
- `golib/auth` `IsAnonymous`, `api/internal/account`, the `account` rate limit, and their tests.
- Web: `accountFlags.ts` (ticket, signed-out notice, save prompt, cached name), the signed-out detection in `supabase.ts`, `AccountNameSheet`, `Toast`, Home's account button, banner and save prompt, the My games and host code sheet entry points, `markGamePlayed` in `JoinRoom.tsx`, name prefill, and `/account` routing.

## Subtasks

### 1. `shared/`: none

The REST contract doesn't change: the api never handles passwords or emails.

### 2. `supabase/config.toml`

- **Remove:** `[auth.external.apple]`, `[auth.external.google]`, `enable_manual_linking`, and the `http://localhost:5173/**` redirect URL (no redirects any more).
- `[auth] minimum_password_length = 8`, `password_requirements = ""` (product: 8 characters, no other rules).
- `[auth.email] enable_signup = true`, `enable_confirmations = false`, `secure_password_change = false`, `double_confirm_changes = false`. Rewrite the comment: email is the username; Schmegettes sends no email.
- `[auth.rate_limit] sign_in_sign_ups = 30` (per 5 minutes per IP), stated explicitly so hosted projects match.
- No migration changes.

### 3. `web/`

- `web/src/lib/supabase.ts`: drop `flowType: "pkce"`; keep the signed-out detection.
- `web/src/lib/account.ts`:
  - **Remove:** `startSignIn` (OAuth), `isEmbeddedBrowser`, `connectedProviders`, `connectProvider`, `disconnectProvider`, `takeAuthError`, `signInPending` use.
  - **Add** `signIn(email, password)` and `createAccount(email, password)`:
    - As a guest: `POST /v1/me/merge-tickets` and store the ticket. If that fails, stop with `error` before touching auth.
    - Then `signInWithPassword` / `signUp`, and on success call `finishSignIn()` (below).
    - Result: `{ kind: "ok", result }`, or `wrong-credentials` (sign-in `invalid_credentials`), `email-taken` (sign-up `user_already_exists`, or `email_exists`), `rate-limited` (status 429 or `over_request_rate_limit`), `weak-password` (`weak_password`), `error`. Map on the auth error's `code`, not its message.
  - `finishSignIn()`: what `completeSignIn` did after the session check (redeem the ticket, set `hadAccount`, clear the save prompt, read `accountName`). Returns `{ gamesAdded, needsName, mergeFailed }`.
  - `retryMerge()` replaces `completeSignIn()` for app load: signed in with a stored ticket, redeem it. Speak only when games were added.
  - `changePassword(current, next)`: verify `current` with `signInWithPassword({ email: session.user.email, password: current })`. On `invalid_credentials` → `wrong-password`. Then `updateUser({ password: next })`.
  - `accountEmail()`: `session.user.email` for the Account page.
  - `signInMessage`: "Account created. Your games are saved." for a new account (replaces "Signed in. Your games are saved.").
- `web/src/ui/SignInSheet.tsx`: rewrite as two tabs, **Sign in** and **Create account**, per `interaction-design.md`.
  - Fields: email (`type="email"`, `autoComplete="username"`) and password (`autoComplete="current-password"` / `"new-password"`, with a **Show** toggle).
  - The button is enabled when the email matches a simple `x@y.z` check and the password has at least 8 characters.
  - **Forgot password?** shows the "ask the person who runs Schmegettes" view.
  - On `email-taken`, offer **Sign in**, which switches the tab and keeps the email. Clear the password on `wrong-credentials`.
  - On success: if the account needs a name, open `AccountNameSheet` (prefilled with the last name used), then the toast; else the toast at once.
  - Prop `initialTab`: the save prompt opens on **Create account**.
- `web/src/ui/SignInReturn.tsx`: becomes `MergeRetry`: on load, call `retryMerge()`; on games added, the toast. No name prompt here any more.
- `web/src/pages/Account.tsx`:
  - Replace the Sign-in providers block with **Email** (read-only) and a **Change password** button.
  - The button opens a sheet: current password, new password with **Show**, **Save**. Errors: "That password isn't right." and "Couldn't change your password. Try again."; success toast "Password changed."
  - Remove the provider error handling.
- Key files: the above plus `web/src/main.tsx` (mount `MergeRetry`).

### 4. Docs

See "Docs to update".

## Contracts preserved

- REST, WebSocket, jobs, `domain.schema.json`: unchanged from #108 (#108's additive `/v1/me` changes stand).
- JWT verification is unchanged; password sessions issue the same Supabase JWTs (`is_anonymous: false`).

## Database migration plan

No change from #108. `20261110180920_accounts.sql` is not yet on `develop`, so it still ships as one migration.

**Admin password reset** (operator procedure for the docs; prove it on staging). In the Supabase SQL editor:

```sql
update auth.users set encrypted_password = extensions.crypt('<new password>', extensions.gen_salt('bf'))
where email = lower('<email>');
```

Or use the dashboard's user page, if it offers setting a password. Signed-in devices stay signed in.

## Success criteria

From the product brief, plus:

1. A guest with games and host access creates an account. On a second browser, signing in with the same email and password shows the same My games and allows creating a room without a code.
2. A guest plays a game on browser B and then signs in to an existing account. The toast says "Signed in. Added 1 game from this phone.", and the guest user no longer exists in `auth.users`.
3. Creating an account with an email that has one shows "That email already has an account. Sign in instead." A wrong password shows "That email and password don't match."
4. No email is sent. Local Mailpit stays empty through create, sign in, change password, and delete.
5. Change password needs the current password. Afterwards the old one fails and the new one works.
6. Lobby, game, end-of-game scoreboard, and host-device screens render no sign-in UI or password field.
7. No email address is rendered except on the owner's Account page, and none is sent to the api or logged.
8. A merge that fails (5xx or network) keeps the ticket and succeeds on the next load.

## Test plan

- **Database and api:** no new tests. Rerun the affected ones after the rework to confirm nothing moved:
  - `mise run db:test`
  - `mise run test:api -- ./internal/account/...`
- **web:**
  - `src/lib/account.test.ts`, rewritten:
    - `signIn` / `createAccount` get a ticket before auth, and don't call auth if the ticket fails.
    - Auth error codes map to the right result.
    - `finishSignIn` redeems and clears the ticket on 200/400 and keeps it on 409/5xx/network.
    - `retryMerge` is quiet unless games were added.
    - `changePassword` rejects a wrong current password without calling `updateUser`.
    - Messages, sign-out, delete, save prompt (kept).
  - `src/pages/Account.test.tsx`:
    - Shows the email.
    - Change password flow and its wrong-password message.
    - Sign out and delete (kept).
  - `src/ui/SignInSheet.test.tsx` (new):
    - Tabs; button enabling at 8 characters.
    - `email-taken` offers Sign in with the email kept.
    - Wrong credentials clear the password.
    - Forgot password view.
    - A new account gets the name prompt, then the toast.
    - `autoComplete` attributes present.
  - Keep and run `Home.test.tsx`, `MyGames.test.tsx`, `HostCodeSheet.test.tsx`, `HostLobby.test.tsx`, `src/lib/supabase.test.ts`.
  - Run: `mise run test:web -- src/lib/account.test.ts src/lib/supabase.test.ts src/ui/SignInSheet.test.tsx src/pages/Account.test.tsx src/pages/Home.test.tsx src/pages/MyGames.test.tsx src/pages/HostCodeSheet.test.tsx src/pages/HostLobby.test.tsx src/pages/JoinRoom.test.tsx`
- **By hand, locally** (no credentials needed; restart Supabase after the `config.toml` change: `supabase stop && mise run db:start`):
  - Success criteria 1–5 in Safari and Chrome.
  - Check Mailpit (`http://127.0.0.1:54324`) is empty afterwards.
  - Whether changing the password signs out the other browser. The product doc says it doesn't; report what Supabase does.

## Logging requirements

Unchanged from #108 (`guest merged`, `merge refused`, `account deleted`, errors). The api never receives emails or passwords. **Never logged:** passwords, emails, merge tickets, tokens. The web client logs nothing new.

## Docs to update

Revert the Apple/Google parts #108 added and describe email and password instead:

- `docs/system-docs/engineering/stack.md`: Identity provider: "anonymous sign-in, then email and password (Supabase Auth, confirmation off; no email is sent); a guest is merged into the account at sign-in".
- `docs/system-docs/security/security-model.md`:
  - Supabase Auth row: anonymous and email/password; confirmation off.
  - "Signed-in player": signs in with email and password.
  - **New Known gaps rows:**
    - Unverified emails (anyone can register an address; the admin deletes squatters).
    - Password guessing limited only by Supabase's per-IP sign-in rate limit (30 per 5 min).
    - Leaked-password checks not enabled.
    - Change password is verified on the client only: a stolen session token can change the password.
- `docs/system-docs/architecture/data-and-isolation.md`: no change beyond #108.
- `docs/system-docs/security/configuration-and-secrets.md`: remove the four `SUPABASE_AUTH_EXTERNAL_*` rows and the Apple/Google rotation rows. No new secrets.
- `docs/system-docs/operations/deployment.md`, "Supabase Auth settings":
  - The email provider is **on** for sign-up, with "Confirm email" **off** and "Secure password change" **off**.
  - Minimum password length 8.
  - No OAuth providers.
  - The admin password-reset SQL above.
- `docs/system-docs/engineering/developer-setup.md`: remove the "Apple and Google sign-in" section. Local accounts work out of the box; Mailpit should stay empty.

## Before release (human, not the implementation agent)

- In each Supabase project's Auth settings: email sign-up on, Confirm email off, Secure password change off, minimum password length 8, Apple and Google off.
- Staging rehearsal proves `private.merge_guest` and `private.delete_account` can delete from `auth.users`, and that the admin reset SQL works.

## Branch

`new-feature/accounts-impl` (PR #108), from and into `daily/2026-11-10`. No Jira ticket: Jira setup is not done for this repo (development-workflow.md, "Jira setup"). Merge `origin/daily/2026-11-10` into #108 first: the daily branch now has this revised `tasks/accounts/`, which #108 deletes. Resolve by keeping the deletion.
