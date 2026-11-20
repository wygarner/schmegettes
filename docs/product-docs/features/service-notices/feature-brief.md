# Service Notices

Not built yet.

## Why

A game night is planned: people come over, the TV is on, and the host opens Schmegettes. If it's broken or about to go down for maintenance, the host needs to know before eight people are waiting, and needs to know it's not their Wi-Fi. Players are guests by default, and Schmegettes never sends email ([accounts](../accounts/feature-brief.md)), so the app itself is the only way to reach them.

[Release strategy](../../../system-docs/operations/release-strategy.md#communication) already promises two channels: **in-app notices** for releases, planned maintenance, and incidents, and a **status page**. This feature is both.

## Jobs to be done

| Who | Job |
|---|---|
| Host | "Before game night, I can tell whether Schmegettes is having problems." |
| Host | "If maintenance is coming, I see it in the lobby before I press Start, so we don't get cut off mid-game." |
| Any player | "When the app can't connect, I'm told it's Schmegettes, not my phone, and where to check." |
| Any player | "I hear about something new once, and it doesn't keep bugging me." |
| Admin (us) | "I post, update, and resolve a notice from the admin page in under a minute, with no deploy." |
| Admin (us) | "When our servers are down, the status page still says so." |

## Rules

### Notices

- Three kinds, in priority order: **Incident** (something is broken now), **Maintenance** (planned downtime with a start and end time), **What's new** (release notes).
- A notice has a title (up to 60 characters), a body (up to 280 characters), and optionally one link. Plain text, no formatting.
- **Incident:** shown from when it's posted until the admin resolves it. Resolving changes it to "Resolved" with a closing line, shown for 24 hours, then gone.
- **Maintenance:** posted at least 24 hours ahead ([release strategy](../../../system-docs/operations/release-strategy.md#communication)). Shown from when it's posted until its end time. During the window it reads as happening now.
- **What's new:** shown until the next release's What's new replaces it, or for 14 days, whichever comes first.
- Updating a notice (a new body, or a changed time) shows it again to everyone who dismissed it.
- Times are shown in the device's own time zone.

### Where they show

- **Home:** one banner at the top, the highest-priority active notice. If more are active, the banner says "+1 more" and opens a sheet listing them all.
- **Host lobby:** Incident and Maintenance notices only, and Maintenance only if it starts within **2 hours** or is happening now. The host can still press Start. The host decides.
- **Never during a game.** Nothing appears on the TV or on phones once a game has started. A notice posted mid-game shows on Home afterwards.
- Phones in a lobby see nothing. The host is the one who decides whether to play.

### Dismissing

- ✕ hides that notice on that device until it's updated.
- What's new: ✕ hides it for good on that device.
- Dismissing is per device and needs no account.

### When the app can't reach Schmegettes

- If Home can't reach the server (the api doesn't answer, or answers with a server error, twice in a row), it shows a built-in banner that needs no server: "Can't reach Schmegettes right now. If other sites work, it's not your connection." with **Status**, which opens the status page in a new tab.
- It retries every 30 s and goes away by itself when the server answers.
- This is separate from a player's own connection being down: if the browser reports it's offline, Home says "You're offline." instead, with no status link.

### Status page

- One public page, **hosted outside Schmegettes' own servers and hosting accounts**, so it works when they don't.
- It shows whether the game is up (from uptime checks on the public health endpoints), and the same Incident and Maintenance notices as the app, with their history for the last 30 days.
- The admin posts each notice **once**, on the admin page. It shows in the app and on the status page. The admin never retypes it.
- Unlisted, like the site: not linked from anywhere except Schmegettes itself.

### Admin page (devtools)

- A **Notices** section on the existing [admin page](../private-access/feature-brief.md#admin-page-devtools), per environment: a list of active and recent notices, and **New notice**.
- New notice: kind, title, body, optional link, and for Maintenance the start and end time. **Preview** shows the Home banner as players will see it. **Post** publishes it.
- On an active notice: **Edit**, and for an Incident **Resolve** (asks for the closing line).
- Every post, edit, and resolve is recorded with who did it and when.

## Decisions (2026-11-19)

**Where the status page lives.**

| Option | For | Against |
|---|---|---|
| **A hosted status-page service, fed from the admin page (chosen)** | Runs on someone else's infrastructure; free tiers exist; includes its own uptime checks | One more outside service; its look won't match ours |
| A static page on our own Vercel account | Matches our look | Shares the web app's hosting account, so it can go down with it |
| No status page; in-app notices only | Least to build | Says nothing when the app itself can't load; breaks the release-strategy promise |

The service is an engineering choice, within these constraints: a free tier is enough, notices can be posted through its API (so the admin posts once), and it collects no player data.

**Never interrupt a game.** A party in progress gains nothing from a banner on the TV. If something breaks mid-game, players already know.

## Out of scope

- Email, text, or push notifications
- Notices targeted at one player or one room
- Rich text, images, or more than one link
- Automatic incidents from alerts (the admin posts every notice)
- A "subscribe to updates" option on the status page
- Translations
