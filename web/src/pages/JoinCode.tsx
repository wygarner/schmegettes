import { Button, Container, Stack, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import { normalizeRoomCode } from "./Home";

/** /join: what the TV tells players to open. They type the code, then pick a name. */
export function JoinCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  function go(event: { preventDefault(): void }) {
    event.preventDefault();
    if (code.length === 5) navigate(`/join/${code}`);
  }

  return (
    <Container size="xs" py="xl">
      <form onSubmit={go}>
        <Stack>
          <Title order={2}>Join a game</Title>
          <TextInput
            label="Room code"
            placeholder="ABCDE"
            size="lg"
            data-autofocus
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.currentTarget.value))}
          />
          <Button type="submit" size="lg" disabled={code.length !== 5}>
            Next
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
