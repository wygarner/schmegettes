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
import { NarratorVoicePicker } from "../game/NarratorVoicePicker";
import { PlayerControls } from "../game/PlayerControls";
import { isValidName, MAX_NAME, setLastName } from "../lib/displayName";
import { money } from "../lib/money";
import { stopNarration } from "../lib/narrator";
import { contestantCount, type ResumeLobby, type RoomState, useRoom } from "../lib/room";
import { type RoomJoin, roomByCode } from "../lib/rooms";
import { getUserId } from "../lib/supabase";
import { GoldButton } from "../ui/GoldButton";
import { Stage, StageBody } from "../ui/Stage";
import { BEVEL, DISPLAY, SOFT, TILE_BG } from "../ui/tokens";
import { Wordmark } from "../ui/Wordmark";
import { Shuffle } from "./JoinRoom";

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
  not_enough_players: "Need at least 1 player.",
  invalid_name: "Names are 1 to 20 characters.",
  not_a_host: "Your host access was removed, so you can't start games.",
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
      <HostLayout
        stage={
          <Stage>
            <StageBody gap="3cqh">
              <Shuffle />
              <Title order={2} ff={DISPLAY} fw={600} c="white" style={{ fontSize: "min(10cqh, 6cqw)" }}>
                Shuffling a fresh board…
              </Title>
              <Text c={SOFT} style={{ fontSize: "clamp(11px, 4.5cqh, 18px)" }}>
                Only categories nobody here has seen
              </Text>
            </StageBody>
          </Stage>
        }
        column={<LobbyPlayers state={state} count={contestantCount(state)} />}
      />
    );
  }
  if (state.phase !== "lobby") {
    return <HostGame state={state} send={send} hostUserId={state.hostUserId} />;
  }

  const count = contestantCount(state);
  const full = count >= state.maxPlayers;
  const canStart = count >= 1;

  function saveName() {
    if (!isValidName(name)) return;
    setLastName(name);
    send({ type: "set_display_name", displayName: name.trim() });
    setEditing(false);
  }

  const stage = (
    <Stage>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Wordmark size="clamp(14px, 8cqh, 32px)" />
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
          <Group gap={2} wrap="nowrap" style={{ minWidth: 0 }}>
            <Text truncate="end" c={SOFT} style={{ fontSize: "clamp(11px, 5cqh, 20px)" }}>
              {state.rematch ? "Rematch · " : ""}Hosted by {state.hostDisplayName}
            </Text>
            <ActionIcon
              variant="subtle"
              color="mauve.1"
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

      <StageBody gap="4cqh">
        <Text fw={600} c={SOFT} style={{ fontSize: "clamp(11px, 6cqh, 24px)" }}>
          Join at {joinUrl}
        </Text>
        <CodeTiles code={code} />
        {state.resume && (
          <Text c={SOFT} style={{ fontSize: "clamp(10px, 4.5cqh, 18px)" }}>
            Resuming the game from{" "}
            {new Date(state.resume.startedAt).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </Text>
        )}
        {state.rematch && (
          <Text c={SOFT} style={{ fontSize: "clamp(10px, 4.5cqh, 18px)" }}>
            Fresh board: none of tonight's clues come back.
          </Text>
        )}
      </StageBody>

      {state.connection === "reconnecting" && (
        <Alert color="yellow" p={8} mb={6}>
          Reconnecting…
        </Alert>
      )}
      {state.error && (
        <Alert color="red" p={8} mb={6}>
          {state.error.message ?? ERRORS[state.error.code] ?? "Something went wrong."}
        </Alert>
      )}

      <Group justify="space-between" align="end" wrap="nowrap">
        <Stack gap={4} display={state.resume ? "none" : undefined}>
          <Button
            variant="outline"
            color="mauve.1"
            disabled={!state.hostPlays && full}
            onClick={() => send({ type: "set_host_plays", plays: !state.hostPlays })}
          >
            {state.hostPlays ? "Leave the game" : "Join the game"}
          </Button>
          {!state.hostPlays && full && (
            <Text size="sm" c={SOFT}>
              Room is full
            </Text>
          )}
          {state.hostPlays && <MicPrompt compact />}
        </Stack>
        <NarratorVoicePicker />
        <Group gap="xs" wrap="nowrap" align="center">
          {!canStart && (
            <Text size="sm" c={SOFT}>
              Need at least 1 player
            </Text>
          )}
          <GoldButton
            disabled={!canStart}
            loading={starting}
            onClick={() => {
              stopNarration(); // a voice sample still playing
              setStarting(true);
              send({ type: "start_game" });
            }}
          >
            {state.resume ? "Resume" : "Start"}
          </GoldButton>
        </Group>
      </Group>
    </Stage>
  );

  const column = (
    <>
      {state.resume ? <ResumePlayers resume={state.resume} /> : <LobbyPlayers state={state} count={count} />}
      {state.hostPlays && (
        <PlayerControls state={state} userId={state.hostUserId} send={send} compact spaceToBuzz buzzerHeight={64} />
      )}
    </>
  );

  return <HostLayout stage={stage} column={column} />;
}

/** The lobby's player list: join order, connected dot, HOST chip, "(reconnecting)". */
function LobbyPlayers({ state, count }: { state: RoomState; count: number }) {
  return (
    <>
      <Group justify="space-between" px={2} wrap="nowrap">
        <Text fw={700}>
          Players {count} / {state.maxPlayers}
        </Text>
      </Group>
      <Box style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {state.players.length === 0 ? (
          <Text c={SOFT} ta="center" mt="md" className="sg-blink">
            Waiting for players…
          </Text>
        ) : (
          <ol
            aria-label="Players"
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {state.players.map((p) => (
              <li
                key={p.userId}
                className="sg-in"
                aria-label={`${p.displayName}${p.role === "host" ? ", host" : ""}${p.connected ? "" : ", reconnecting"}`}
                style={{
                  flex: "1 1 0",
                  minHeight: 24,
                  maxHeight: 40,
                  borderRadius: 8,
                  background: TILE_BG,
                  boxShadow: BEVEL,
                  padding: "0 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: p.connected ? 1 : 0.45,
                  color: "#fff",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 8,
                    flexShrink: 0,
                    background: p.connected ? "var(--mantine-color-teal-5)" : "transparent",
                    border: p.connected ? "none" : `1.5px solid ${SOFT}`,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {p.displayName}
                  {!p.connected && <span style={{ fontWeight: 500, fontSize: 11, color: SOFT }}> (reconnecting)</span>}
                </span>
                {p.role === "host" && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: ".08em",
                      color: SOFT,
                      border: "1px solid rgba(255,166,217,.45)",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    HOST
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Box>
    </>
  );
}

/** The room code, one gold letter per board-blue tile, readable from the couch. */
function CodeTiles({ code }: { code: string }) {
  const letters = code.split("").map((ch, i) => ({ ch, id: `${i}-${ch}` }));
  return (
    <section aria-label="Room code" style={{ display: "flex", gap: "2cqw" }}>
      {letters.map(({ ch, id }) => (
        <div
          key={id}
          style={{
            width: "min(13cqw, 30cqh)",
            height: "min(17cqw, 38cqh)",
            borderRadius: 8,
            background: "var(--mantine-color-mauve-9)",
            boxShadow: `${BEVEL}, 0 6px 18px rgba(0,0,0,.35)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: "min(12cqw, 28cqh)",
            color: "var(--mantine-color-green-4)",
            textShadow: "0 3px 0 rgba(0,0,0,.5)",
          }}
        >
          {ch}
        </div>
      ))}
    </section>
  );
}

/** A resume lobby's players: the game's contestants with their scores, dimmed until back. */
function ResumePlayers({ resume }: { resume: ResumeLobby }) {
  const back = resume.players.filter((p) => p.back).length;
  return (
    <>
      <Text fw={700} px={2}>
        Players {back} / {resume.players.length}
      </Text>
      <ol
        aria-label="Players"
        style={{ display: "flex", flexDirection: "column", gap: 4, listStyle: "none", margin: 0, padding: 0 }}
      >
        {resume.players.map((p) => (
          <li
            key={p.userId}
            aria-label={`${p.displayName}, ${money(p.score)}${p.back ? "" : ", not back yet"}`}
            style={{
              minHeight: 28,
              borderRadius: 8,
              background: TILE_BG,
              boxShadow: BEVEL,
              padding: "0 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              opacity: p.back ? 1 : 0.45,
              color: "#fff",
            }}
          >
            <Text truncate="end" fw={600}>
              {p.displayName}
            </Text>
            <Text fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
              {money(p.score)}
            </Text>
          </li>
        ))}
      </ol>
    </>
  );
}
