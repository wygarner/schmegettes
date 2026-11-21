# Agent QA

**Source of truth:** `scripts/qa-accounts.mjs`, `supabase/migrations/20261121161615_qa_accounts.sql`, `supabase/tests/qa_accounts.test.sql`

How an agent checks the real app, which identities it uses, what evidence it leaves, and where a person must take over. Automated tests remain required; this is the check that the built behavior works end to end.

## Accounts

Each environment has seven ordinary Supabase accounts. Their passwords are in Wyatt's password manager, never the repository, an agent settings file, a screenshot, or a PR comment.

| Label | Role | Email |
|---|---|---|
| QA Host | Host with permanent access | `qa-host@<QA_ACCOUNT_DOMAIN>` |
| QA 1 | Contestant | `qa-1@<QA_ACCOUNT_DOMAIN>` |
| QA 2 | Contestant | `qa-2@<QA_ACCOUNT_DOMAIN>` |
| QA 3 | Contestant | `qa-3@<QA_ACCOUNT_DOMAIN>` |
| QA 4 | Contestant | `qa-4@<QA_ACCOUNT_DOMAIN>` |
| QA 5 | Contestant | `qa-5@<QA_ACCOUNT_DOMAIN>` |
| QA 6 | Contestant | `qa-6@<QA_ACCOUNT_DOMAIN>` |

The operator replaces the domain placeholder after provisioning. QA accounts never appear on the leaderboard. Their private Stats and My games still work; production rules prevent a QA game from entering history.

## When it is required

| Change | Where | When |
|---|---|---|
| Any player-visible change (new feature, enhancement, bug fix with a UI or gameplay effect) | Local stack (`mise run dev`) | Before the implementation PR is marked ready; recorded on the PR |
| Every release | Staging | Release verification, after the automated end-to-end suite |
| Every production deploy | Production | Smoke only, within the production rules below |
| Internal changes with no visible effect | — | Not required |

## Production rules

Use QA accounts only.

| Allowed | Forbidden |
|---|---|
| Sign in as a QA account | Finish a game; it writes history and seen clues |
| Create a room with QA Host | Touch any non-QA account or room |
| Join with QA contestants | Open or use the Admin page, including host codes, host access, and notices |
| Play up to one clue | Use the owner role or staff access |
| Leave the game and close the room | Write through the Supabase dashboard |

If a check needs a forbidden action, stop and ask Wyatt. A production smoke must leave no open room and no finished game.

## Run locally

1. Start the stack with `mise run dev`.
2. Put the local public Supabase URL, anon key, API URL, and QA domain in `devtools/.env.local`, following `devtools/.env.example`.
3. Run `node scripts/qa-accounts.mjs --env local create`. Save the one-time passwords outside the repository.
4. Open one host viewport at 844×390 and two phone viewports at 390×844. Sign in only with QA accounts.

The create command is idempotent: existing identities are skipped. `list` prints the expected labels and emails without credentials:

```bash
node scripts/qa-accounts.mjs --env local list
```

## Session checklist

- Sign in only as QA Host and QA contestants.
- Record the commit and exact environment before starting.
- Exercise the changed player-visible path, including its failure or empty state when relevant.
- Close every room and leave every game.
- On staging, preview and then apply cleanup:

  ```bash
  node scripts/qa-accounts.mjs --env staging cleanup
  node scripts/qa-accounts.mjs --env staging cleanup --apply
  ```

- Production cleanup is a dry run by default, clamps the age to at least 24 hours in the API, and requires both flags to apply:

  ```bash
  node scripts/qa-accounts.mjs --env production cleanup
  node scripts/qa-accounts.mjs --env production cleanup --apply --yes
  ```

- Confirm the evidence record says exactly what was and was not checked.

Cleanup deletes only games and rooms whose participants are all QA accounts. A game or room involving any non-QA account is refused in SQL. QA accounts themselves are never deleted.

## Evidence record

Post this on the implementation PR, or in a release's internal notes:

```markdown
### QA: {pass | fail | partial}
**Environment:** local | staging | production · **Commit:** {sha} · **By:** {agent or person}
**Devices:** host 844×390, phone 390×844 ×2 (or a real device)
| Step | Expected | Result | Evidence |
|---|---|---|---|
**Not tested (needs a human):** {e.g. narrator voice on iPhone}
**Cleanup:** rooms closed {codes}; cleanup script run {yes/no}
```

Screenshots may contain only QA accounts. Crop or retake any screenshot showing another player. Never show a password, host code, token, admin screen, or browser autofill suggestion. Use the app view, not developer tools containing payloads.

## Human checklist

Agents cannot establish these real-device behaviors. A release changing one needs a person to check it and record the result in the evidence:

- Narrator voice and timing on a real iPhone host.
- Spoken answers through a real phone microphone.
- Playback with the iPhone silent switch on.
- AirPlay to a TV.
- Home Screen web-app mode.

## Provisioning after merge

Wyatt runs `create` once for staging and production, saves the printed passwords in the password manager, and replaces `<QA_ACCOUNT_DOMAIN>` in this document with the configured domain. The staging QA Host may also be the E2E host by setting `E2E_HOST_EMAIL` and `E2E_HOST_PASSWORD` to that account.

The first player-visible PR after GH-254 is the proof run: an agent follows this document and posts a complete local evidence record, then that PR is linked from GH-254's implementation PR.
