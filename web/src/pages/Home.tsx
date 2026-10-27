import { Button, Container, Group, Stack, TextInput, Title } from "@mantine/core";
import { useState } from "react";

export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

export function Home() {
  const [code, setCode] = useState("");

  return (
    <Container size="xs" py="xl">
      <Stack gap="lg">
        <Title order={1}>Schmegettes</Title>
        <Button size="lg">Host a game</Button>
        <Group align="end" grow>
          <TextInput
            label="Room code"
            placeholder="ABCDE"
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.currentTarget.value))}
          />
          <Button disabled={code.length !== 5}>Join</Button>
        </Group>
      </Stack>
    </Container>
  );
}
