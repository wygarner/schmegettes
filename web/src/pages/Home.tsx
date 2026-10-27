import { Alert, Button, Container, Group, Modal, Stack, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import { getLastName, isValidName, MAX_NAME, setLastName } from "../lib/displayName";
import { createRoom } from "../lib/rooms";

export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

export function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  function openNaming() {
    setName(getLastName());
    setFailed(false);
    setNaming(true);
  }

  async function create(event: { preventDefault(): void }) {
    event.preventDefault();
    if (creating || !isValidName(name)) return;
    setCreating(true);
    const result = await createRoom(name.trim());
    setCreating(false);
    if (!result.ok) {
      setNaming(false);
      setFailed(true);
      return;
    }
    setLastName(name);
    navigate(`/host/${result.data.room.code}`);
  }

  return (
    <Container size="xs" py="xl">
      <Stack gap="lg">
        <Title order={1}>Schmegettes</Title>
        <Button size="lg" onClick={openNaming}>
          Host a game
        </Button>
        {failed && <Alert color="red">Couldn't create a room. Try again.</Alert>}
        <Group align="end" grow>
          <TextInput
            label="Room code"
            placeholder="ABCDE"
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.currentTarget.value))}
          />
          <Button disabled={code.length !== 5} onClick={() => navigate(`/join/${code}`)}>
            Join
          </Button>
        </Group>
      </Stack>

      <Modal opened={naming} onClose={() => setNaming(false)} title="What's your name?" centered>
        <form onSubmit={create}>
          <Stack>
            <TextInput
              label="Your name"
              data-autofocus
              maxLength={MAX_NAME}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <Button type="submit" loading={creating} disabled={!isValidName(name)}>
              Create room
            </Button>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
