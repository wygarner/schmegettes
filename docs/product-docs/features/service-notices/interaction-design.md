# Service Notices: Interaction Design

Rules are in the [feature brief](./feature-brief.md).

## Lifecycle of a notice

```text
Incident:     posted ──Edit──▶ updated (shown again) ──Resolve──▶ "Resolved" (24 h) ──▶ gone
Maintenance:  posted (≥24 h ahead) ──start time──▶ "happening now" ──end time──▶ gone
What's new:   posted ──next What's new, or 14 days──▶ gone
```

## Home banner

```text
┌───────────────────────────────────────────────────┐
│ ● Buzzers are slow to light up                 ✕  │
│   We're looking into it. Games still work, but    │
│   buzzing may lag a second.            +1 more ›  │
└───────────────────────────────────────────────────┘
```

- Top of Home, above everything else, full width. Same shape as the signed-out banner ([accounts](../accounts/interaction-design.md)). If both apply, the notice banner is first and the signed-out banner sits under it.
- The dot gives the kind: `RED` for Incident, light mauve for Maintenance, Venice green for What's new ([design system](../../architecture/design-system.md)). The title is bold, the body under it, and a link (if any) is the last line, opening in a new tab.
- **+1 more ›** (or +2) appears only when several notices are active, and opens a sheet with every active notice in priority order, each with its own ✕.

| Kind | Title line as shown |
|---|---|
| Incident | the title, e.g. "Buzzers are slow to light up" |
| Incident, resolved | "Resolved: Buzzers are slow to light up", then the closing line as the body |
| Maintenance, ahead | "Down for maintenance Sat 9:00–9:30 PM", then the body |
| Maintenance, now | "Down for maintenance until 9:30 PM", then the body |
| What's new | "What's new: {title}" |

## Host lobby warning

```text
┌───────────────────────────────────────────────────┐
│ ● Down for maintenance 9:00–9:30 PM (in 40 min).  │
│   A full game takes about 45 minutes.             │
└───────────────────────────────────────────────────┘
```

- A slim strip at the top of the host lobby's stage, in the same place as the Home Screen tip ([lobby](../lobby/interaction-design.md)), which it replaces while shown. It must not push the room code off screen at 667 × 320.
- Incident: the title only, one line. Maintenance: only when it starts within 2 hours or is happening now.
- No ✕: it's information for this game, and it goes away by itself. **Start** works as usual.
- The second line ("A full game takes about 45 minutes.") shows only for maintenance that starts within 60 minutes.

## Can't reach Schmegettes

```text
┌───────────────────────────────────────────────────┐
│ Can't reach Schmegettes right now. If other       │
│ sites work, it's not your connection.   Status ›  │
└───────────────────────────────────────────────────┘
```

- Built into the web app, so it shows even when no notice can be fetched. Replaces the notice banner while shown.
- **Status ›** opens the status page in a new tab.
- Offline (the browser says so): "You're offline." with no link.

## Admin page: Notices

```text
Notices — production
┌──────────────────────────────────────────────────────┐
│ ● Incident  Buzzers are slow to light up             │
│   Posted 8:42 PM by Wyatt · Edited 9:10 PM           │
│                               [Edit]  [Resolve]      │
├──────────────────────────────────────────────────────┤
│ ● Maintenance  Sat 9:00–9:30 PM                      │
│   Posted Thu 2:00 PM by Wyatt            [Edit]      │
└──────────────────────────────────────────────────────┘
[New notice]                        Recent (30 days) ›
```

- **New notice** opens a form: Kind (three choices), Title (counter to 60), Body (counter to 280), Link (optional), and for Maintenance, Start and End in the admin's own time zone. **Preview** shows the Home banner exactly as players will see it. **Post** publishes it to the app and the status page.
- Maintenance less than 24 hours ahead asks "This is less than 24 hours' notice. Post anyway?"
- **Resolve** asks for a closing line (required, up to 280 characters), e.g. "Fixed at 9:25 PM. Sorry about that."

## Edge cases

| Situation | Behavior |
|---|---|
| A notice is posted while a game is in progress | Nothing changes in the game. Players see it on Home afterwards |
| Maintenance starts while a game is in progress | The notice says when it starts. What happens to the game is decided by how the maintenance is run, not by this feature |
| Home is open when a notice is posted | It appears within 5 minutes (Home checks every 5 minutes while open, and on every return to Home) |
| Posting to the status page fails | The notice still posts in the app. The admin page shows "Posted in the app; the status page didn't update." with **Retry** |
| The api is down, so no notice can be fetched | Home shows "Can't reach Schmegettes" (above), never an old notice from memory |
| A dismissed notice is edited | It shows again on that device |
| Two Incidents at once | Both are listed in the "+1 more" sheet; the most recently posted is on the banner |
| Maintenance end time passes but the work isn't done | The notice disappears at its end time. The admin edits the end time, which shows it again to everyone |
| The device's clock is wrong | Whether a notice is active is decided by the server; only the displayed times use the device's time zone |
