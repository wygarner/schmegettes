---
jira-type: new-feature
jira-title: "Private access: invite-only hosting"
---
**Task Type:** New Feature. A new capability: invited sign-in for hosts by emailed link, and a gate on hosting.

**Product docs:** [feature brief](../../docs/product-docs/features/private-access/feature-brief.md), [interaction design](../../docs/product-docs/features/private-access/interaction-design.md)

**Problem:** The clue catalog comes from a dataset we may use only privately ([clue-catalog](../clue-catalog/product-brief.md)). Today anyone who opens the site can host, because the device signs in anonymously and can create a room, start a game, and see every clue on the TV. Production can't load real clues until that's closed.

**Outcomes:**
- Only a device signed in with an invited email can create a room, Start, or Rematch. The server checks each one.
- Hosts sign in with an emailed link. The same email has a 6-digit code as a fallback. There are no passwords and no Google sign-in.
- Contestants and spectators still join by code, anonymously, with no change.
- The admin manages invites (email addresses) directly in the database.
- Every page is unlisted: no search indexing, no public sign-up.

**Player flow:**
- Host, first time: Home → **Host a game** → email sheet → **Email me a sign-in link** → "Check your email" → tap the link in Mail (it opens Safari and signs in) or type the 6-digit code → name → lobby. Later visits go straight to the name prompt.
- Host, not invited: after they enter the email, the "You're not on the invite list" sheet shows the address. **No email is sent.** They can still join games by code.
- Home when signed in: "Signed in as {email} · Sign out".
- Contestant: unchanged. A phone that only joins never sees a sign-in prompt.
- Sign-in links the anonymous account, so history and seen clues are kept. If the email already has an account from another device, this device switches to it, and its anonymous history isn't merged.
- Link and code rules:
  - Each is single use, expires after 1 hour, and a newer one replaces it.
  - Resend is available after 60 s.
  - After 5 wrong codes, the host must request a new one.
  - Email matching ignores case and surrounding spaces.
- Edge cases:
  - The link opens in the mail app's built-in browser or on another device: that browser is signed in, and the host types the code on the iPhone. The email says so.
  - If the original tab is still waiting when the link signs in a new Safari tab, the original tab moves on by itself.
  - Invite removed after the email was sent: sign-in completes, then the not-invited sheet. No room is created.
  - Invite removed while in the lobby: Start fails with "Your invite was removed, so you can't start games."
  - Invite removed mid-game: the game plays to the end, and Rematch fails with the same message.
  - Direct API calls by an uninvited user (create room, Start, Rematch) are refused. Nothing is created and no clue is read.
  - At rollout, open lobbies with uninvited hosts are closed and games in progress finish.

**Success Criteria:**
- An uninvited account (anonymous or email) gets a refusal on create room, Start, and Rematch, both through the UI and through direct `api` and `game` calls. Tests cover each.
- An uninvited address triggers no email.
- On an iPhone in Safari, an invited host signs in by tapping the link in Mail, and separately by typing the code after opening the email in the Gmail app. Both continue to the lobby and host a full game.
- A phone joins and plays a full game with no sign-in.
- Removing an invite blocks that host's next Start or Rematch, and a game in progress still finishes.
- The invite table has RLS and explicit grants, plus a test in `supabase/tests/`: no user role can read or change invites, including their own row. The "is this address invited" check reveals only yes or no.
- Every page sends `noindex`.
- An invited host who had anonymous games before signing in still sees them in **My games** afterwards.

**Out of scope:** an invite or admin screen; Google, Apple, or password sign-in; contestant accounts; limits per invite; loading the clue catalog (that's [clue-catalog](../clue-catalog/product-brief.md); production loads after this ships).

**Assumptions:**
- The mechanism is Supabase Auth email OTP (one email with both the link and the code), plus anonymous-account linking (`docs/system-docs/security/security-model.md` already plans "Linked player"). Engineering confirms.
- Staging and production need a real email sender (custom SMTP). Supabase's built-in sender is for testing only and allows very few emails per hour. Engineering picks the provider and adds its secret per [configuration-and-secrets.md](../../docs/system-docs/security/configuration-and-secrets.md).
- Join-by-code rate limits (security model) are enough to stop code guessing. If they aren't built yet, engineering should include them or flag it. Sign-in emails also need a rate limit, per address and per IP.
- The rollout order is fixed: this ships to production before the production clue load.
