---
jira-type: enhancement
jira-title: "Rotating host codes and an admin page in devtools"
---
**Task Type:** Enhancement (changes how private-access host codes work and adds the admin screen that feature listed as out of scope)

**Problem:** The admin gets host codes out of the Supabase SQL editor, which needs the database open in a browser for every invite. Codes are one-use, so inviting a party's worth of hosts means creating a code per person by hand. There is no list of who can host short of querying tables.

**Outcomes:**
- The admin reads the current host code in devtools in under 10 seconds, for local, staging, or production, without any database credential on their computer.
- One code covers everyone invited at the same time; it stops working on its own within 50 minutes (45-minute window + 5-minute grace), or at once with **Rotate now**.
- The admin sees every host and removes any of them from the same page.

**Player flow:** (full detail in `docs/product-docs/features/private-access/feature-brief.md` and `interaction-design.md`)

- *Code clock:* each environment has one current code, changing every 45 minutes on a fixed UTC clock (12:00, 12:45, 13:30, …). The previous code is still accepted for 5 minutes after a scheduled rotation. **Rotate now** starts a new code immediately; the old one stops at once (no grace), and the next scheduled rotation is 45 minutes after the manual one.
- *Host:* unchanged screens. Types the code → gets host access → recorded as their own host. Any number of people can use the same current code. Someone who already has host access entering it again stays one host. Wrong, expired, or manually retired code: "That code didn't work." 5 tries a minute, as today.
- *Admin (devtools, local only):* pick environment → sign in with Schmegettes email + password → if on that environment's admin list, see: current code, countdown, when the previous code stops working, **Rotate now** (with confirm); hosts newest first (account email, or "Guest" + last name played as; since when; editable note); **Remove** (with confirm). Production is marked in red. Not an admin or wrong password: "Can't sign in as an admin here." (no hint which).
- *Removing a host:* same effect as today: next create, Start, or Rematch refused; a game in progress plays to the end.
- *Release:* unused one-use codes stop working; existing hosts keep access. The owner adds themselves to the admin list in each environment (SQL, once) before the release.

**Timing and edge cases:**
- Code read at 12:44, typed at 12:47 → accepted (grace). Typed at 12:51 → refused.
- Two people enter the same code at the same moment → both become hosts.
- Two admins press Rotate now at once → one new code; both pages show it.
- Admin session expires → next action returns to sign-in, environment kept.
- Admin removed from the list mid-session → next action refused with the sign-in message.
- Admin API called by anyone not on the list (player, guest, signed out) → same response as a missing page; rate-limited.

**Success Criteria:**
- On staging, the devtools page shows a code that a fresh guest device can redeem to host; the same code works on a second device; after **Rotate now** the old code is refused and the new one works.
- A code is accepted up to 5 minutes after its scheduled rotation and refused after.
- A signed-in non-admin and a guest calling every admin endpoint get the not-found response; tests prove it.
- No database owner URL, service-role key, or secret is needed in devtools or on the admin's computer.
- Hosts list shows each host once, with the right email or guest name; Remove makes their next Start fail.
- Existing hosts keep host access across the release.

**Out of scope:**
- An admin page in the public web app
- More than one code at a time, or per-invitee codes
- Changing the 45-minute period or grace without a release
- Admins managed from the admin page (the admin list is edited in SQL)
- Hosts inviting hosts; per-host limits
- Deploying devtools anywhere
