---
jira-type: new-feature
jira-title: "Private access: invite-only hosting"
---
**Task Type:** New Feature. A new capability: invited sign-in for hosts, and a gate on hosting.

**Product docs:** [feature brief](../../docs/product-docs/features/private-access/feature-brief.md), [interaction design](../../docs/product-docs/features/private-access/interaction-design.md)

**Problem:** The clue catalog comes from a dataset we may use only privately ([clue-catalog](../clue-catalog/product-brief.md)). Today anyone who opens the site can host, because the device signs in anonymously and can create a room, start a game, and see every clue on the TV. Production can't load real clues until that's closed.

**Outcomes:**
- Only devices signed in with an invited Google account can create a room, Start, or Rematch. The server checks each one.
- Contestants and spectators still join by code, anonymously, with no change.
- The admin manages invites (email addresses) directly in the database.
- Every page is unlisted: no search indexing, no public sign-up.

**Player flow:**
- Host, first time: Home → **Host a game** → "Schmegettes is invite-only" sheet → **Sign in with Google** (redirect) → invited → name → lobby. Later visits go straight to the name prompt.
- Host, not invited: the "You're not on the invite list" sheet shows their email, with **Use another account** and **Back**. They can still join games by code.
- Home when signed in: "Signed in as {email} · Sign out".
- Contestant: unchanged. A phone that only joins never sees a sign-in prompt.
- Sign-in links the anonymous account, so history and seen clues are kept. If the Google account already exists from another device, this device switches to it, and its anonymous history isn't merged.
- Edge cases:
  - Invite removed while in the lobby: Start fails with "Your invite was removed, so you can't start games."
  - Invite removed mid-game: the game plays to the end, and Rematch fails with the same message.
  - Direct API calls by an uninvited user (create room, Start, Rematch) are refused. Nothing is created and no clue is read.
  - Sign-in cancelled or failed: back on Home, signed out, with a toast.
  - Email matching ignores case.
  - At rollout, open lobbies with uninvited hosts are closed and games in progress finish.

**Success Criteria:**
- An uninvited account (anonymous or Google) gets a refusal on create room, Start, and Rematch, both through the UI and through direct `api` and `game` calls. Tests cover each.
- An invited account hosts a full game on an iPhone in Safari, including the Google redirect.
- A phone joins and plays a full game with no sign-in.
- Removing an invite blocks that host's next Start or Rematch, and a game in progress still finishes.
- The invite table has RLS and explicit grants, plus a test in `supabase/tests/`: no user role can read or change invites, including their own row.
- Every page sends `noindex`.
- An invited host who had anonymous games before signing in still sees them in **My games** afterwards.

**Out of scope:** an invite or admin screen; email-link or other sign-in methods; contestant accounts; limits per invite; loading the clue catalog (that's [clue-catalog](../clue-catalog/product-brief.md); production loads after this ships).

**Assumptions:**
- Google is enough for the first invitees. If one has no Google account, an email link is the follow-up.
- Supabase Auth's Google provider and anonymous-account linking are the mechanism (`docs/system-docs/security/security-model.md` already plans "Linked player"). Engineering confirms.
- Join-by-code rate limits (security model) are enough to stop code guessing. If they aren't built yet, engineering should include them or flag it.
- The rollout order is fixed: this ships to production before the production clue load.
