import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { HostGame } from "../game/HostGame";
import { HostLayout } from "../game/HostLayout";
import { MicPrompt } from "../game/MicPrompt";
import { PlayerControls } from "../game/PlayerControls";
import { isValidName, MAX_NAME, setLastName } from "../lib/displayName";
import { contestantCount, type RoomState, useRoom } from "../lib/room";
import { type RoomJoin, roomByCode } from "../lib/rooms";
import { getUserId } from "../lib/supabase";

type Load = { kind: "loading" } | { kind: "ready"; room: RoomJoin } | { kind: "not-host" } | { kind: "error" };

/** /host/:code: the TV view of the lobby. Only the room's host may open it. */
export function HostLobby() {
  const { code = "" } = useParams();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void (async () => {
      const [result, userId] = await Promise.all([roomByCode(code), getUserId().catch(() => "")]);
      if (!live) return;
      if (result.ok && result.data.room.hostUserId === userId) setLoad({ kind: "ready", room: result.data });
      else if (result.ok || result.problem === "room-not-found") setLoad({ kind: "not-host" });
      else setLoad({ kind: "error" });
    })();
    return () => {
      live = false;
    };
  }, [code]);

  if (load.kind === "loading")
    return (
      <Centered>
        <Loader />
      </Centered>
    );
  if (load.kind === "not-host") {
    return (
      <Centered>
        <Text>Only the host can open this screen.</Text>
        <Anchor component={Link} to={`/join/${code}`}>
          Join this room instead
        </Anchor>
      </Centered>
    );
  }
  if (load.kind === "error") {
    return (
      <Centered>
        <Text>Couldn't load the room. Reload to try again.</Text>
      </Centered>
    );
  }
  return <ConnectedHostLobby room={load.room} />;
}

function ConnectedHostLobby({ room }: { room: RoomJoin }) {
  const { state, send } = useRoom(room.gameSocketUrl, room.room.hostUserId);
  return <HostLobbyView code={room.room.code} joinUrl={`${window.location.origin}/join`} state={state} send={send} />;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <Center mih="100vh" p="md">
      <Stack align="center">{children}</Stack>
    </Center>
  );
}

const ERRORS: Record<string, string> = {
  room_full: "The room is full.",
  not_enough_players: "Need at least 2 players.",
  invalid_name: "Names are 1 to 20 characters.",
};

export function HostLobbyView({
  code,
  joinUrl,
  state,
  send,
}: {
  code: string;
  joinUrl: string;
  state: RoomState;
  send: (message: ClientMessage) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [starting, setStarting] = useState(false);

  // A Start press ends when the phase moves on or the server answers with an error.
  useEffect(() => {
    if (state.phase !== "lobby" || state.error) setStarting(false);
  }, [state.phase, state.error]);

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
    return <HostGame state={state} send={send} hostUserId={state.hostUserId} />;
  }

  const count = contestantCount(state);
  const full = count >= state.maxPlayers;
  const canStart = count >= 2;

  function saveName() {
    if (!isValidName(name)) return;
    setLastName(name);
    send({ type: "set_display_name", displayName: name.trim() });
    setEditing(false);
  }

  const stage = (
    <Stack h="100%" justify="space-between" gap="xs">
      <Group justify="space-between" wrap="nowrap">
        <Title order={4}>SCHMEGETTES</Title>
        {editing ? (
          <Group gap="xs" wrap="nowrap">
            <TextInput
              aria-label="Your name"
              size="xs"
              maxLength={MAX_NAME}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
            />
            <Button size="xs" onClick={saveName} disabled={!isValidName(name)}>
              Save
            </Button>
          </Group>
        ) : (
          <Group gap="xs" wrap="nowrap">
            <Text truncate="end">Hosted by {state.hostDisplayName}</Text>
            <ActionIcon
              variant="subtle"
              aria-label="Edit your name"
              onClick={() => {
                setName(state.hostDisplayName);
                setEditing(true);
              }}
            >
              ✎
            </ActionIcon>
          </Group>
        )}
      </Group>

      <Stack align="center" gap={0}>
        <Text>Join at {joinUrl}</Text>
        <Text
          aria-label="Room code"
          ff="Oswald, Impact, sans-serif"
          fw={700}
          style={{ fontSize: "clamp(3rem, min(12vw, 26vh), 10rem)", letterSpacing: "0.25em", lineHeight: 1.1 }}
        >
          {code}
        </Text>
      </Stack>

      {state.connection === "reconnecting" && (
        <Alert color="yellow" p={8}>
          Reconnecting…
        </Alert>
      )}
      {state.error && (
        <Alert color="red" p={8}>
          {state.error.message ?? ERRORS[state.error.code] ?? "Something went wrong."}
        </Alert>
      )}

      <Group justify="space-between" align="end" wrap="nowrap">
        <Stack gap={4}>
          <Button
            variant="default"
            disabled={!state.hostPlays && full}
            onClick={() => send({ type: "set_host_plays", plays: !state.hostPlays })}
          >
            {state.hostPlays ? "Leave the game" : "Join the game"}
          </Button>
          {!state.hostPlays && full && <Text size="sm">Room is full</Text>}
          {state.hostPlays && <MicPrompt />}
        </Stack>
        <Stack gap={4} align="end">
          <Button
            disabled={!canStart}
            loading={starting}
            onClick={() => {
              setStarting(true);
              send({ type: "start_game" });
            }}
          >
            Start
          </Button>
          {!canStart && <Text size="sm">Need at least 2 players</Text>}
        </Stack>
      </Group>
    </Stack>
  );

  const column = (
    <>
      <Text fw={700}>
        Players {count} / {state.maxPlayers}
      </Text>
      <Box style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {state.players.length === 0 ? (
          <Text c="dimmed">Waiting for players…</Text>
        ) : (
          <Stack gap={2}>
            {state.players.map((p) => (
              <Text key={p.userId} size="sm" truncate="end" c={p.connected ? undefined : "dimmed"}>
                {p.connected ? "●" : "◌"} {p.displayName}
                {p.role === "host" && " HOST"}
                {!p.connected && " (reconnecting)"}
              </Text>
            ))}
          </Stack>
        )}
      </Box>
      {state.hostPlays && <PlayerControls state={state} userId={state.hostUserId} send={send} compact spaceToBuzz />}
    </>
  );

  return <HostLayout stage={stage} column={column} />;
}
