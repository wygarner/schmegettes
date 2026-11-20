---
jira-type: new-feature
jira-title: "Service notices and a status page"
---
**Task Type:** New Feature. A new way for players to hear about problems, maintenance, and releases.

**Product docs:** [service-notices/feature-brief.md](../../docs/product-docs/features/service-notices/feature-brief.md) and [service-notices/interaction-design.md](../../docs/product-docs/features/service-notices/interaction-design.md). Update [release-strategy.md](../../docs/system-docs/operations/release-strategy.md) "Communication" (remove the three "not yet implemented"), and link the notices from `incident-response.md` once the `observability` task adds it.

**Problem:** Players are guests by default, and Schmegettes sends no email, so when the game breaks or goes down for maintenance there is no way to tell anyone. A host finds out with a room full of people waiting, and can't tell whether it's their Wi-Fi. [release-strategy.md](../../docs/system-docs/operations/release-strategy.md) promises in-app notices and a status page for incidents, maintenance, and release notes, and neither exists.

**Outcomes:**
- The admin posts an Incident, Maintenance, or What's new notice from the admin page in under a minute, with no deploy, and it shows in the app and on the status page.
- A host opening Schmegettes sees the highest-priority notice on Home. In the host lobby they see incidents, and maintenance due within 2 hours, before they press Start.
- Nothing ever interrupts a game in progress.
- When the api can't be reached, every player sees a built-in "Can't reach Schmegettes" banner pointing to the status page, which stays up because it's hosted outside our servers and accounts.

**Player flow:**
- **Normal day:** no notice, no banner. Home looks as it does today.
- **Planned maintenance:** posted on Thursday for Saturday 9:00–9:30 PM. Home shows "Down for maintenance Sat 9:00–9:30 PM" until a player dismisses it. Saturday at 8:20 PM, a host opens the lobby and sees the strip "(in 40 min). A full game takes about 45 minutes." The host can still press Start. At 9:30 PM the notice disappears everywhere.
- **Incident during game night:** the admin posts "Buzzers are slow to light up". Players on Home see it within 5 minutes. A game in progress sees nothing. After the game, Home shows it. The admin resolves it: "Resolved: …" shows for 24 hours, even to players who dismissed the original, then it's gone.
- **The api is down:** Home can't fetch anything, so it shows "Can't reach Schmegettes right now. If other sites work, it's not your connection." with **Status**. The status page shows the game as down and any incident the admin posted. When the api recovers, the banner goes away within 30 s.
- **Release:** after sign-off, the admin posts What's new. It shows on Home once per device until dismissed, replaced by the next one, or 14 days pass.
- **Edge cases** (full list in the interaction design): a notice posted mid-game waits for Home; an edited notice shows again to everyone; the status page failing to update leaves the in-app notice posted and offers Retry; the server decides whether a notice is active, so a wrong device clock only affects the times shown.

**Success Criteria:**
- Posting each kind from the staging admin page shows it on staging Home within 5 minutes, with the right title format and dot color, and on the status page within a minute.
- A Maintenance notice starting in 90 minutes shows in the host lobby; one starting in 3 hours doesn't. Neither appears on phones or during a game.
- ✕ hides a notice on that device only, and an edit brings it back.
- With the staging `api` stopped, Home shows "Can't reach Schmegettes" within two failed checks, and **Status** opens a status page that shows the outage.
- At 667 × 320 the lobby strip never pushes the room code off screen.
- Every post, edit, and resolve is recorded with who and when, and only admins can post.
- The status-page service gets no player data: only notice text and uptime checks on public endpoints.

**Out of scope:** Email, push, or text notifications; notices aimed at one player or room; automatic incidents from alerts; rich text or images; status-page subscriptions; translations; what happens to games in progress during maintenance.
