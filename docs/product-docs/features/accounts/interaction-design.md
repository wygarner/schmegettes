# Accounts: Interaction Design

## States of a device

```text
guest ──Create account / Sign in──▶ signed in ──Sign out──▶ new guest
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
| Host code sheet | "Sign in first so you can host from any device." **Sign in** | Nothing |
| Lobby, game, end-of-game scoreboard, host device while hosting | Nothing | Nothing |

## Flows

### Sign in or create an account (guest)

1. Tap **Sign in**. A sheet opens on **Sign in**, with **Create account** one tap away:

   ```text
   ┌────────────────────────────────────┐
   │ Keep your games                    │
   │ Your history, stats, and hosting,  │
   │ on any phone.                      │
   │                                    │
   │ [ Sign in ]  Create account        │
   │                                    │
   │ Email     [ sam@example.com      ] │
   │ Password  [ ••••••••••      Show ] │
   │                                    │
   │ [          SIGN IN          ]      │
   │ Forgot password?                   │
   │                                    │
   │ We never email you or show your    │
   │ email to anyone.                   │
   │                         Not now    │
   └────────────────────────────────────┘
   ```

   - **Create account** has the same two fields, the button **Create account**, and under the password "At least 8 characters." No "confirm password" field: **Show** lets the player check what they typed.
   - The fields are marked for password managers (email as the username; a new password on Create account, the current one on Sign in), so phones offer to fill and save them.
   - The button is enabled once the email looks like an email and the password has 8 or more characters.
2. **Create account:** "What should we call you?" with the last-used name prefilled, then **Save**.
3. The sheet closes and the player stays where they were, with a toast:
   - Create account: "Account created. Your games are saved."
   - Sign in, with guest games moved over: "Signed in. Added 3 games from this phone."
   - Sign in, nothing to move: "Signed in."

**Forgot password?** replaces the form with: "Ask the person who runs Schmegettes to reset your password. Then sign in and change it on your Account page." and **Back**.

### Save your games (after a game)

A guest contestant who leaves a room after a finished game lands on Home with the same sheet, titled **Save your games**, opening on **Create account**, and starting "Tonight's scores are only on this phone." **Not now** hides it for 7 days.

### Signed out unexpectedly

Home shows a banner: "You've been signed out. Sign in to get your games back." with **Sign in**, and an ✕ to dismiss. The player can join or host as a guest meanwhile.

### Account page (`/account`)

```text
┌────────────────────────────────────┐
│ ‹ Home                             │
│ ACCOUNT                            │
│ ┌────────────────────────────────┐ │
│ │ (P)  PRIYA                     │ │  ◀ avatar: initial in a
│ │      priya.r@example.com       │ │    green-mauve-pink ring
│ └────────────────────────────────┘ │
│ PROFILE                            │
│ ┌────────────────────────────────┐ │
│ │ ▣ Name              Priya    › │ │
│ │ ▣ Email   priya.r@example.com  │ │
│ └────────────────────────────────┘ │
│ Your email is your username. It    │
│ can't be changed.                  │
│ SECURITY                           │
│ ┌────────────────────────────────┐ │
│ │ ▣ Change password            › │ │
│ │ ▣ Sign out                   › │ │
│ │   Your games stay in your acct │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ ▣ Delete account (red)       › │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

Rows and sheets follow the [menu screens](../../architecture/design-system.md#menu-screens) look. Every sheet below slides up from the bottom.

- **Guest**: "You're playing as a guest. An account keeps your games and host access on any phone. Playing stays free of sign-ups." with **Create account** (primary) and **I have an account** (ghost), each opening the sign-in sheet on that tab.
- **Name** opens a sheet: 1–20 characters, with a counter. Changes the leaderboard name and future name prompts; old scoreboards keep their names.
- **Email** is shown only here, only to its owner. It can't be changed.
- **Change password** opens a sheet: **Current password**, **New password** (at least 8 characters, with a show/hide eye and a length meter), **Save**. Success: toast "Password changed." A wrong current password: "That password isn't right."
- **Sign out** asks "Sign out? Your games stay in your account. This phone starts fresh as a guest." → **Sign out** / **Cancel**.
- **Delete account** asks "Delete your account? Your stats and leaderboard spot are deleted. Past scoreboards will show you as Former player. This can't be undone." → **Delete account** (solid red) / **Cancel**. "Finish or leave your game first." shows as an error box at the top of the page.
- The leaderboard switch is described in [stats and leaderboard](../stats-and-leaderboard/interaction-design.md).

## Messages

| Situation | Message |
|---|---|
| Wrong email or password | "That email and password don't match." |
| Create account with an email that has an account | "That email already has an account. Sign in instead." (with **Sign in** switching the tab, email kept) |
| Too many tries | "Too many tries. Wait a few minutes and try again." |
| Network or server error | "Couldn't sign in. Try again." |
| Moving guest games failed | Toast: "Signed in. Some games from this phone couldn't be added yet." |

## Edge cases

| Situation | Behavior |
|---|---|
| Sign-in fails | The player stays a guest; nothing is moved. The fields keep what was typed except the password on a wrong-password error. |
| Moving guest games into the account fails partway | Nothing is moved and the player stays signed in to the account. The guest's games stay with the guest on the server, and the move is retried the next time the app loads on this device (within 24 hours). |
| Guest and account were in the same game | The account keeps its result; the guest's row shows "Former player". The toast counts only games actually added. |
| Someone already registered my email | "That email already has an account." The player asks the admin, who deletes that account; then they can create theirs. |
| Signed in on two phones, one signs out or changes the password | Only that phone is signed out; the other stays signed in. |
| Deleted on one phone while signed in on another | The other phone is signed out at its next request and shows the signed-out banner. Signing in fails ("That email and password don't match."); the email can be used to create a new, empty account. |
| A guest comes back more than 90 days after last playing | Their guest was deleted, so the device starts as a new guest with no history. No banner: there's nothing to sign in to. Their old games show them as "Former player" |
| A guest in an open room or a game in progress reaches 90 days | Not deleted: being in a room counts as use |
| Admin resets the password | Devices already signed in stay signed in; the new password is needed for the next sign-in. |
| Admin removes host access | Removed for the account on every device; a game in progress plays to the end ([private access](../private-access/feature-brief.md)). |
| An in-app browser (Instagram, Messages) | Works the same; its password autofill may be missing. |
| Tapping a sign-in link while in a room | Not possible: no sign-in entry points in rooms. |
