import { Stack } from "@mantine/core";
import { useEffect, useState } from "react";
import { setAccountName } from "../lib/account";
import { isValidName, MAX_NAME } from "../lib/displayName";
import { Callout, Field, MenuButton, MenuSheet } from "./menu";

/** "What should we call you?": the account's name, 1–20 characters. */
export function AccountNameSheet({
  opened,
  initial,
  title = "What should we call you?",
  onSaved,
  onClose,
}: {
  opened: boolean;
  initial: string;
  title?: string;
  onSaved: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (opened) {
      setName(initial);
      setFailed(false);
    }
  }, [opened, initial]);

  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    if (busy || !isValidName(name)) return;
    setBusy(true);
    const ok = await setAccountName(name);
    setBusy(false);
    if (!ok) return setFailed(true);
    onSaved(name.trim());
  }

  return (
    <MenuSheet
      opened={opened}
      onClose={onClose}
      title={title}
      description="Shown on the leaderboard and prefilled when you join a game. Past scoreboards keep the name you had then."
    >
      <form onSubmit={save}>
        <Stack gap={18}>
          {failed && <Callout tone="danger">Couldn't save your name. Try again.</Callout>}
          <Field label="Your name" icon="user" autoFocus maxLength={MAX_NAME} counter value={name} onChange={setName} />
          <MenuButton type="submit" full loading={busy} disabled={!isValidName(name)}>
            Save
          </MenuButton>
        </Stack>
      </form>
    </MenuSheet>
  );
}
