---
task-type: enhancement
task-title: "Host code in the app for admins"
---
**Task Type:** Enhancement. Adds an admin screen to the web app for the existing private-access feature, from QA on 2026-11-21.

**Product docs:** [private-access/feature-brief.md](../../docs/product-docs/features/private-access/feature-brief.md) and [private-access/interaction-design.md](../../docs/product-docs/features/private-access/interaction-design.md) (PR #270), including the 2026-11-21 decision that reverses "admin page only in devtools" for the code. Remove the "Not yet implemented (task `in-app-host-code`)" notes when it ships, and add the Admin row to Home in [design-system.md](../../docs/product-docs/architecture/design-system.md#home).

**Problem:** The only way to read the host code is the devtools admin page, which runs only on a laptop. At a party, the admin has their phone, not their laptop, so they can't invite a new host on the spot or kill a code that got shared.

**Outcomes:**
- An admin signed in to the web app sees an **Admin** row on Home and reads the current host code on their phone in two taps.
- The code is hidden until tapped, so an admin whose phone is the mirrored host device never puts it on the TV by accident.
- The admin can rotate a leaked code from the phone.
- Nobody else can tell the screen exists, and the api's admin checks don't change.

**Player flow:**
- **Admin at a party:** opens Schmegettes, sees Home with **Admin · Host code** after Stats, taps it. `/admin` shows "Staging" (red for Production), the code masked `••••-••••`, **Show**, **Copy code**, "Changes at 1:30 PM", "Previous code works until 12:50 PM", and **Rotate now**. They tap **Copy code** and paste it into a message, or **Show** and read it out.
- **Rotation:** at 1:30 PM the screen updates on its own to the new code, masked.
- **Leaked code:** **Rotate now** → "Retire K7RX-M2PQ now? Anyone who hasn't used it yet will need the new code." → **Rotate**. The new code appears masked; the old one stops working at once.
- **Anyone else:** no Admin row; opening `/admin` lands on Home.
- **Edge cases** (full list in the interaction design): session expiry returns to `/admin` after sign-in; an admin taken off the list loses the row on the next refresh; the api unreachable shows "Couldn't load the host code" with Try again; leaving the screen or locking the phone hides the code again.

**Success Criteria:**
- On staging, an admin account sees the row and the same code as the devtools admin page; a non-admin account and a guest see no row, and `/admin` sends them Home.
- The code never shows unmasked unless **Show** was tapped on this visit; **Copy code** copies it either way.
- **Rotate now** from the app retires the code at once, and the devtools page shows the new one.
- A non-admin calling the admin API gets the same not-found answer as today.
- No hosts list, notes, Remove, or notices in the app.

**Out of scope:** Managing hosts in the app; making someone an admin from the app; push or email of codes; changing the rotation period or grace period.
