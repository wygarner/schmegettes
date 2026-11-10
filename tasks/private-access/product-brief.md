---
jira-type: new-feature
jira-title: "Private access: invite-only hosting"
---
**Task Type:** New Feature. A new capability: one-use host codes, and a gate on hosting.

**Product docs:** [feature brief](../../docs/product-docs/features/private-access/feature-brief.md), [interaction design](../../docs/product-docs/features/private-access/interaction-design.md)

**Problem:** The clue catalog comes from a dataset we may use only privately ([clue-catalog](../clue-catalog/product-brief.md)). Today anyone who opens the site can host, because the device signs in anonymously and can create a room, start a game, and see every clue on the TV. Production can't load real clues until that's closed.

**Outcomes:**
- Only a device with host access can create a room, Start, or Rematch. The server checks each one.
- A device gets host access by entering a one-use **host code** from the admin. The code is spent, and a new one is created at once. No email, no accounts.
- Contestants and spectators still join by room code, anonymously, with no change.
- The admin reads codes and removes hosts directly in the database.
- Every page is unlisted: no search indexing, no public sign-up.

**Player flow:**
- Host, first time: Home → **Host a game** → host-code sheet → enter `K7RX-M2PQ` → name → lobby. Later visits go straight to the name prompt.
- Contestant: unchanged. A phone that only joins never sees the host-code sheet.
- Host access belongs to the device's existing anonymous account, so history is unchanged. Clearing browser data or switching devices means a new code.
- Code rules:
  - 8 characters, no look-alikes.
  - Case, spaces, and the dash are ignored.
  - Single use. A new unused code is created the moment one is spent.
  - 5 tries per minute.
- Edge cases:
  - Wrong or spent code: "That code didn't work."
  - Two devices use the same code at once: the first wins.
  - Host access removed while in the lobby: Start fails with "Your host access was removed, so you can't start games."
  - Host access removed mid-game: the game plays to the end, and Rematch fails with the same message.
  - Direct API calls without host access (create room, Start, Rematch) are refused. Nothing is created and no clue is read.
  - At release, lobbies whose host has no access can't Start and close after 30 minutes idle (owner approved).
  - The release creates the first code. Nobody can host until the admin gives it out (owner approved).

**Success Criteria:**
- A device without host access gets a refusal on create room, Start, and Rematch, both through the UI and through direct `api` and `game` calls. Tests cover each.
- Entering a valid code grants host access, marks the code used, and leaves exactly one new unused code. Entering it again on another device fails.
- Two simultaneous redemptions of one code: exactly one succeeds.
- The 6th try within a minute is refused.
- A phone joins and plays a full game with no prompt.
- Removing a host blocks their next Start or Rematch, and a game in progress still finishes.
- No user role can read or change codes or hosts. Tests in `supabase/tests/`.
- Supabase Auth can't create email or password accounts (email sign-up off). Anonymous sign-in still works.
- Every page sends `noindex`.

**Out of scope:** an admin screen; accounts, email, Google, or passwords; moving host access between devices; hosts inviting hosts; limits per host; loading the clue catalog (that's [clue-catalog](../clue-catalog/product-brief.md); production loads after this ships).
