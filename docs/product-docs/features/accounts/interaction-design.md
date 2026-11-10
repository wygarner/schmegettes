# Accounts: Interaction Design

## States of a device

```text
guest ──Continue with Apple/Google──▶ signed in ──Sign out──▶ new guest
  ▲                                     │
  └──────────── Delete account ─────────┘   (also a new guest)

signed in ──browser data lost──▶ guest  (Home: "You've been signed out")
```

## Where sign-in lives

| Screen | Guest sees | Signed-in player sees |
|---|---|---|
| Home (top right) | **Sign in** | Their name's initial in a circle → Account |
| Home, after leaving a room with a finished game | "Save your games" sheet (see below) | Nothing |
| My games, under the list | "Played without an account. Sign in to keep these on any phone." **Sign in** | Nothing |
| Stats | "Sign in to see your stats and the leaderboard." **Sign in** | Their stats ([stats and leaderboard](../stats-and-leaderboard/interaction-design.md)) |
| Lobby, game, end-of-game scoreboard, host device while hosting | Nothing | Nothing |

## Flows

### Sign in (guest)

1. Tap **Sign in**. A sheet opens:

   ```text
   ┌────────────────────────────────────┐
   │ Keep your games                    │
   │ Your history, stats, and hosting,  │
   │ on any phone.                      │
   │                                    │
   │ [  Continue with Apple  ]          │
   │ [  Continue with Google ]          │
   │                                    │
   │ We never email you or show your    │
   │ email to anyone.                   │
   │                         Not now    │
   └────────────────────────────────────┘
   ```

2. Apple or Google asks the player to confirm, then returns to Schmegettes.
3. **First sign-in:** "What should we call you?" with the last-used name prefilled, then **Save**. Returning players skip this.
4. The player lands back where they started, with a toast:
   - First sign-in: "Signed in. Your games are saved."
   - Returning, with guest games moved over: "Signed in. Added 3 games from this phone."
   - Returning, nothing to move: "Signed in."

### Save your games (after a game)

A guest contestant who leaves a room after a finished game lands on Home with the same sheet, titled **Save your games** and starting "Tonight's scores are only on this phone." **Not now** hides it for 7 days.

### Signed out unexpectedly

Home shows a banner: "You've been signed out. Sign in to get your games back." with **Sign in**, and an ✕ to dismiss. The player can join or host as a guest meanwhile.

### Account page (`/account`)

```text
┌────────────────────────────────────┐
│ ‹ Home              Account        │
│                                    │
│ Name           Wyatt          Edit │
│                                    │
│ Sign-in                            │
│   Apple          Connected         │
│   Google         [ Connect ]       │
│                                    │
│ Show me on the leaderboard   [on]  │
│                                    │
│ [ Sign out ]                       │
│ Delete account                     │
└────────────────────────────────────┘
```

- **Edit** name: 1–20 characters. Changes the leaderboard name and future name prompts; old scoreboards keep their names.
- **Connect** adds the other sign-in method. Disconnecting one is allowed only while the other is connected.
- **Sign out** asks "Sign out? Your games stay in your account. This phone starts fresh as a guest." → **Sign out** / **Cancel**.
- **Delete account** asks "Delete your account? Your stats and leaderboard spot are deleted. Past scoreboards will show you as Former player. This can't be undone." → **Delete** (red) / **Cancel**.
- The leaderboard switch is described in [stats and leaderboard](../stats-and-leaderboard/interaction-design.md).

### Host code sheet

For a guest, the [host code sheet](../private-access/feature-brief.md) adds one line under the code field: "Sign in first so you can host from any device." with **Sign in**. Entering a code without signing in works as today.

## Edge cases

| Situation | Behavior |
|---|---|
| Sign-in opened inside an in-app browser (Instagram, Messages preview) that Google blocks | "Google sign-in doesn't work in this app. Open Schmegettes in Safari or Chrome." with **Copy link**. Apple is still offered. |
| Player cancels at Apple or Google | Back on the sheet, still a guest. No message. |
| Sign-in fails (network, provider error) | "Couldn't sign in. Try again." Still a guest; nothing is moved. |
| Moving guest games into the account fails partway | Nothing is moved and the player stays signed in to the account. The guest's games stay with the guest on the server, and the move is retried at the next sign-in on this device. "Some games from this phone couldn't be added yet." |
| Guest and account were in the same game | The account keeps its result; the guest's row shows "Former player". The toast counts only games actually added. |
| Connecting a Google account that already has its own Schmegettes account | "That Google account is already used by another Schmegettes account." Nothing changes. |
| Signed in on two phones, one signs out | Only that phone is signed out. |
| Deleted on one phone while signed in on another | The other phone is signed out at its next request and shows the signed-out banner; signing in creates a new, empty account. |
| Admin removes host access | Removed for the account on every device; a game in progress plays to the end ([private access](../private-access/feature-brief.md)). |
| Tapping a sign-in link while in a room | Not possible: no sign-in entry points in rooms. |
