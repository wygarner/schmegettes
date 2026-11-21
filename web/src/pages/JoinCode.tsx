import { Container, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import { GoldButton } from "../ui/GoldButton";
import { HomeButton } from "../ui/HomeButton";
import { DISPLAY, PHONE_BG, SOFT } from "../ui/tokens";
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
    <div style={{ minHeight: "100dvh", background: PHONE_BG, color: "#fff" }}>
      <HomeButton floating />
      <Container size="xs" py={48}>
        <form onSubmit={go}>
          <Stack>
            <Title order={2} ff={DISPLAY} fw={600} fz={34}>
              Join a game
            </Title>
            <Text size="sm" c={SOFT}>
              Type the code on the TV.
            </Text>
            <TextInput
              styles={{ input: { fontFamily: DISPLAY, fontWeight: 700, letterSpacing: ".3em", textAlign: "center" } }}
              label="Room code"
              placeholder="ABCDE"
              size="lg"
              data-autofocus
              autoCapitalize="characters"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(normalizeRoomCode(e.currentTarget.value))}
            />
            <GoldButton type="submit" size="lg" disabled={code.length !== 5}>
              Next
            </GoldButton>
          </Stack>
        </form>
      </Container>
    </div>
  );
}
