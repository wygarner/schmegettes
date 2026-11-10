import { Alert, Modal, Stack, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { setAccountName } from "../lib/account";
import { isValidName, MAX_NAME } from "../lib/displayName";
import { GoldButton } from "./GoldButton";

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
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <form onSubmit={save}>
        <Stack>
          {failed && <Alert color="red">Couldn't save your name. Try again.</Alert>}
          <TextInput
            label="Your name"
            description="Shown on the leaderboard and prefilled when you join a game"
            data-autofocus
            maxLength={MAX_NAME}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <GoldButton type="submit" loading={busy} disabled={!isValidName(name)}>
            Save
          </GoldButton>
        </Stack>
      </form>
    </Modal>
  );
}
