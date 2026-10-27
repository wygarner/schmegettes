import { Alert, Anchor, Button, Center, Container, Group, Loader, Stack, Text, TextInput, Title } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { getLastName, isValidName, MAX_NAME, setLastName } from "../lib/displayName";
import { type RoomState, useRoom } from "../lib/room";
import { joinRoom, type RoomJoin, type RoomProblem, roomByCode } from "../lib/rooms";
import { getUserId } from "../lib/supabase";

export const JOIN_ERRORS: Record<RoomProblem, string> = {
  "room-not-found": "No room with that code.",
  "room-full": "This room is full.",
  "game-started": "This game has already started.",
  "invalid-name": "Names are 1 to 20 characters.",
  error: "Couldn't join. Try again.",
};

type Stage = { kind: "checking" } | { kind: "name" } | { kind: "joined"; room: RoomJoin; userId: string };

/** /join/:code: a phone joins a room. A member who reloads goes straight back in. */
export function JoinRoom() {
  const { code = "" } = useParams();
  const [stage, setStage] = useState<Stage>({ kind: "checking" });
  const [name, setName] = useState(getLastName);
  const [joining, setJoining] = useState(false);
  const [problem, setProblem] = useState<RoomProblem | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [result, userId] = await Promise.all([roomByCode(code), getUserId().catch(() => "")]);
      if (!live) return;
      setStage(result.ok ? { kind: "joined", room: result.data, userId } : { kind: "name" });
    })();
    return () => {
      live = false;
    };
  }, [code]);

  async function join(event: { preventDefault(): void }) {
    event.preventDefault();
    if (joining || !isValidName(name)) return;
    setJoining(true);
    setProblem(null);
    const [result, userId] = await Promise.all([joinRoom(code, name.trim()), getUserId().catch(() => "")]);
    setJoining(false);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    setLastName(name);
    setStage({ kind: "joined", room: result.data, userId });
  }

  if (stage.kind === "checking")
    return (
      <Centered>
        <Loader />
      </Centered>
    );
  if (stage.kind === "joined") return <ConnectedPlayer room={stage.room} userId={stage.userId} />;

  return (
    <Container size="xs" py="xl">
      <form onSubmit={join}>
        <Stack>
          <Title order={2}>Join {code}</Title>
          {problem && <Alert color="red">{JOIN_ERRORS[problem]}</Alert>}
          {problem === "room-not-found" && (
            <Anchor component={Link} to="/join">
              Try another code
            </Anchor>
          )}
          <TextInput
            label="What's your name?"
            data-autofocus
            maxLength={MAX_NAME}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Button type="submit" size="lg" loading={joining} disabled={!isValidName(name)}>
            Join
          </Button>
        </Stack>
      </form>
    </Container>
  );
}

function ConnectedPlayer({ room, userId }: { room: RoomJoin; userId: string }) {
  const navigate = useNavigate();
  const isHost = room.room.hostUserId === userId;
  // The host's device is the TV; it never connects here as a player.
  const { state, send, leave } = useRoom(isHost ? null : room.gameSocketUrl, room.room.hostUserId);
  if (isHost) {
    return (
      <Centered>
        <Text>You're hosting this room.</Text>
        <Anchor component={Link} to={`/host/${room.room.code}`}>
          Open the host screen
        </Anchor>
      </Centered>
    );
  }
  return (
    <PlayerView
      state={state}
      userId={userId}
      send={send}
      onLeave={() => {
        leave();
        navigate("/");
      }}
    />
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <Center mih="100vh" p="md">
      <Stack align="center" ta="center">
        {children}
      </Stack>
    </Center>
  );
}

export function PlayerView({
  state,
  userId,
  send,
  onLeave,
}: {
  state: RoomState;
  userId: string;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const me = state.players.find((p) => p.userId === userId);

  if (state.connection === "closed") {
    return (
      <Centered>
        <Title order={2}>This room has closed.</Title>
        <Anchor component={Link} to="/">
          Back to home
        </Anchor>
      </Centered>
    );
  }
  if (state.connection === "connecting")
    return (
      <Centered>
        <Loader />
      </Centered>
    );
  if (state.phase === "building_board") {
    return (
      <Centered>
        <Loader />
        <Title order={2}>Shuffling a fresh board…</Title>
      </Centered>
    );
  }
  if (state.phase !== "lobby") {
    return (
      <Centered>
        <Title order={2}>The board is ready. Look at the TV.</Title>
      </Centered>
    );
  }

  function saveName() {
    if (!isValidName(name)) return;
    setLastName(name);
    send({ type: "set_display_name", displayName: name.trim() });
    setEditing(false);
  }

  return (
    <Centered>
      {state.connection === "reconnecting" && <Alert color="yellow">Reconnecting…</Alert>}
      {state.error?.code === "invalid_name" && <Alert color="red">Names are 1 to 20 characters.</Alert>}
      <Title order={2}>You're in, {me?.displayName ?? "…"}.</Title>
      <Text>Look at the TV. {state.hostDisplayName || "The host"} will start the game.</Text>
      {editing ? (
        <Group>
          <TextInput
            aria-label="Your name"
            maxLength={MAX_NAME}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
          />
          <Button onClick={saveName} disabled={!isValidName(name)}>
            Save
          </Button>
        </Group>
      ) : (
        <Group>
          <Button
            variant="default"
            onClick={() => {
              setName(me?.displayName ?? "");
              setEditing(true);
            }}
          >
            Edit name
          </Button>
          <Button variant="subtle" color="red" onClick={onLeave}>
            Leave
          </Button>
        </Group>
      )}
    </Centered>
  );
}
