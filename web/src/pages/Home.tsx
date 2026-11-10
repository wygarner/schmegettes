import { Alert, Anchor, Button, Container, Group, Modal, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { getLastName, isValidName, MAX_NAME, setLastName } from "../lib/displayName";
import { getHostAccess } from "../lib/hostAccess";
import { createRoom } from "../lib/rooms";
import { GoldButton } from "../ui/GoldButton";
import { DISPLAY, PHONE_BG, SOFT } from "../ui/tokens";
import { Wordmark } from "../ui/Wordmark";
import { HostCodeSheet } from "./HostCodeSheet";

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
  const [checking, setChecking] = useState(false);
  const [askingCode, setAskingCode] = useState(false);

  // Hosting is invite-only: a device without host access enters its host code first.
  async function hostAGame() {
    if (checking) return;
    setFailed(false);
    setChecking(true);
    const canHost = await getHostAccess();
    setChecking(false);
    if (canHost === null) setFailed(true);
    else if (canHost) openNaming();
    else setAskingCode(true);
  }

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
      // Host access was removed since the check: ask for a new code.
      if (result.problem === "not-a-host") setAskingCode(true);
      else setFailed(true);
      return;
    }
    setLastName(name);
    navigate(`/host/${result.data.room.code}`);
  }

  return (
    <div style={{ minHeight: "100dvh", background: PHONE_BG, color: "#fff" }}>
      <Container size="xs" py={48}>
        <Stack gap={36}>
          <Stack gap={6} align="center" ta="center">
            <Title order={1} style={{ margin: 0 }}>
              <Wordmark size="clamp(40px, 12vw, 64px)" />
            </Title>
            <Text c={SOFT}>The quiz show for your living room</Text>
          </Stack>

          <Stack gap="sm">
            <Group align="end" gap="xs" wrap="nowrap">
              <TextInput
                style={{ flex: 1 }}
                label="Room code"
                placeholder="ABCDE"
                size="xl"
                autoCapitalize="characters"
                autoComplete="off"
                styles={{ input: { fontFamily: DISPLAY, fontWeight: 700, letterSpacing: ".3em", textAlign: "center" } }}
                value={code}
                onChange={(e) => setCode(normalizeRoomCode(e.currentTarget.value))}
              />
              <GoldButton size="xl" disabled={code.length !== 5} onClick={() => navigate(`/join/${code}`)}>
                Join
              </GoldButton>
            </Group>
          </Stack>

          <Stack gap="xs">
            {failed && <Alert color="red">Couldn't create a room. Try again.</Alert>}
            <Button size="lg" variant="light" loading={checking} onClick={hostAGame}>
              Host a game
            </Button>
            <Text size="xs" c={SOFT} ta="center">
              Host on the device you'll put on the TV. Everyone else joins on their phone.
            </Text>
          </Stack>

          <Anchor component={Link} to="/games" ta="center" c="slate.2">
            My games
          </Anchor>
        </Stack>
      </Container>

      <HostCodeSheet
        opened={askingCode}
        onClose={() => setAskingCode(false)}
        onUnlocked={() => {
          setAskingCode(false);
          openNaming();
        }}
      />

      <Modal opened={naming} onClose={() => setNaming(false)} title="What's your name?" centered>
        <form onSubmit={create}>
          <Stack>
            <TextInput
              label="Your name"
              description="Shown on the TV as “Hosted by …”"
              data-autofocus
              maxLength={MAX_NAME}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <GoldButton type="submit" loading={creating} disabled={!isValidName(name)}>
              Create room
            </GoldButton>
          </Stack>
        </form>
      </Modal>
    </div>
  );
}
