import { Alert, Anchor, Button, Center, Container, Group, Loader, Stack, Text, TextInput, Title } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { MicGate } from "../game/MicGate";
import { PlayerGame } from "../game/PlayerGame";
import { markGamePlayed } from "../lib/accountFlags";
import { getPrefillName, isValidName, MAX_NAME, setLastName } from "../lib/displayName";
import { money } from "../lib/money";
import { type RoomState, useRoom } from "../lib/room";
import { joinRoom, type RoomJoin, type RoomProblem, roomByCode } from "../lib/rooms";
import { onMicPermissionChange } from "../lib/speech";
import { getUserId } from "../lib/supabase";
import { GoldButton } from "../ui/GoldButton";
import { DISPLAY, PHONE_BG, SOFT } from "../ui/tokens";

export const JOIN_ERRORS: Record<RoomProblem, string> = {
  "room-not-found": "No room with that code.",
  "room-full": "This room is full.",
  "game-started": "This game has already started.",
  "invalid-name": "Names are 1 to 20 characters.",
  "not-a-host": "Hosting is invite-only.",
  "rate-limited": "Too many tries. Wait a minute and try again.",
  "not-in-game": "This game is being resumed. Only its players can join.",
  "not-the-host": "Couldn't join. Try again.",
  "not-resumable": "Couldn't join. Try again.",
  error: "Couldn't join. Try again.",
};

type Stage =
  | { kind: "checking" }
  | { kind: "mic" }
  | { kind: "name" }
  | { kind: "rejoin"; room: RoomJoin; userId: string }
  | { kind: "joined"; room: RoomJoin; userId: string };

/**
 * /join/:code: a phone joins a room. The microphone comes first: nobody is added to the room
 * until it's allowed. A member who reloads goes back in, through the microphone screen again
 * if the browser asks again (iPhone Safari does on each visit).
 */
export function JoinRoom() {
  const { code = "" } = useParams();
  // From Home's "resuming your game" card: the seat and name come from the game, so no prompt.
  const [params] = useSearchParams();
  const resuming = params.get("resume") === "1";
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ kind: "checking" });
  const [name, setName] = useState(getPrefillName);
  const [joining, setJoining] = useState(false);
  const [problem, setProblem] = useState<RoomProblem | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [result, userId] = await Promise.all([roomByCode(code), getUserId().catch(() => "")]);
      if (!live) return;
      if (!result.ok) setStage({ kind: "mic" });
      else if (result.data.room.hostUserId === userId) setStage({ kind: "joined", room: result.data, userId });
      else setStage({ kind: "rejoin", room: result.data, userId });
    })();
    return () => {
      live = false;
    };
  }, [code]);

  // After the microphone: the name, or, from a resume invite, straight into the seat (the
  // name comes from the game).
  const toName = useCallback(() => {
    if (!resuming) {
      setStage({ kind: "name" });
      return;
    }
    void (async () => {
      const [joined, userId] = await Promise.all([
        joinRoom(code, getPrefillName() || "Player"),
        getUserId().catch(() => ""),
      ]);
      if (joined.ok) {
        setStage({ kind: "joined", room: joined.data, userId });
        return;
      }
      setProblem(joined.problem);
      setStage({ kind: "name" });
    })();
  }, [resuming, code]);

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
  if (stage.kind === "mic" || stage.kind === "rejoin") {
    return (
      <Centered>
        <MicGate
          onGranted={stage.kind === "mic" ? toName : () => setStage({ ...stage, kind: "joined" })}
          onLeave={() => navigate("/")}
        />
      </Centered>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: PHONE_BG, color: "#fff" }}>
      <Container size="xs" py={48}>
        <form onSubmit={join}>
          <Stack>
            <Text size="xs" fw={700} c="#d6a3c8" style={{ letterSpacing: ".14em" }}>
              ROOM {code}
            </Text>
            <Title order={2} ff={DISPLAY} fw={600} fz={34}>
              Join {code}
            </Title>
            <Text size="sm" c={SOFT}>
              Your name is how you'll show up on the TV.
            </Text>
            {problem && <Alert color="red">{JOIN_ERRORS[problem]}</Alert>}
            {problem === "room-not-found" && (
              <Anchor component={Link} to="/join">
                Try another code
              </Anchor>
            )}
            <TextInput
              label="What's your name?"
              size="lg"
              data-autofocus
              maxLength={MAX_NAME}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <GoldButton type="submit" size="lg" loading={joining} disabled={!isValidName(name)}>
              Join
            </GoldButton>
          </Stack>
        </form>
      </Container>
    </div>
  );
}

function ConnectedPlayer({ room, userId }: { room: RoomJoin; userId: string }) {
  const navigate = useNavigate();
  const isHost = room.room.hostUserId === userId;
  // Microphone turned off mid-game: the phone drops its socket (the TV shows the player
  // "(reconnecting)") until it's allowed again.
  const [micLost, setMicLost] = useState(false);
  useEffect(() => (isHost ? undefined : onMicPermissionChange((s) => setMicLost(s === "denied"))), [isHost]);
  const micBack = useCallback(() => setMicLost(false), []);
  // The host's device is the TV; it never connects here as a player.
  const { state, send, leave } = useRoom(isHost || micLost ? null : room.gameSocketUrl, room.room.hostUserId);
  if (micLost && !isHost) {
    return (
      <Centered>
        <MicGate
          onGranted={micBack}
          onLeave={() => {
            leave();
            navigate("/");
          }}
        />
      </Centered>
    );
  }
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
    <Center mih="100dvh" p="md" style={{ background: PHONE_BG, color: "#fff" }}>
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
  const finishedAsContestant = state.phase === "finished" && me?.role === "contestant";

  // A contestant who finished a game is offered "Save your games" back on Home (guests only).
  useEffect(() => {
    if (finishedAsContestant) markGamePlayed();
  }, [finishedAsContestant]);

  if (state.connection === "closed") {
    return (
      <Centered>
        <Title order={2} ff={DISPLAY} fw={600}>
          {state.replaced ? "You're playing on another device." : "This room has closed."}
        </Title>
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
    const shuffling = (
      <Stack align="center" ta="center">
        <Shuffle />
        <Title order={2} ff={DISPLAY} fw={600}>
          Shuffling a fresh board…
        </Title>
      </Stack>
    );
    return <PlayerGame state={state} userId={userId} send={send} lobby={shuffling} />;
  }
  if (state.phase !== "lobby") {
    return <PlayerGame state={state} userId={userId} send={send} onLeave={onLeave} />;
  }

  function saveName() {
    if (!isValidName(name)) return;
    setLastName(name);
    send({ type: "set_display_name", displayName: name.trim() });
    setEditing(false);
  }

  // The buzzer is on screen from here on; in the lobby a tap only animates it.
  const lobby = (
    <Stack gap="md">
      {state.connection === "reconnecting" && <Alert color="yellow">Reconnecting…</Alert>}
      {state.error?.code === "invalid_name" && <Alert color="red">Names are 1 to 20 characters.</Alert>}
      <div>
        {state.rematch && (
          <Text c="green.4" fw={800} size="xs" style={{ letterSpacing: ".14em" }}>
            REMATCH
          </Text>
        )}
        <Title order={2} ff={DISPLAY} fw={500} fz={32} lh={1.1}>
          {state.resume
            ? `You're back, ${me?.displayName ?? "…"}. ${money(state.resume.players.find((p) => p.userId === userId)?.score ?? 0)}`
            : `You're in, ${me?.displayName ?? "…"}.`}
        </Title>
        <Text size="sm" c={SOFT} mt={6}>
          {state.rematch
            ? `Same room, fresh board. Waiting for ${state.hostDisplayName} to start.`
            : `Hosted by ${state.hostDisplayName}. Look for your name on the TV.`}
        </Text>
      </div>
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
        <Group grow>
          <Button
            variant="light"
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
    </Stack>
  );
  return <PlayerGame state={state} userId={userId} send={send} lobby={lobby} />;
}

/** Six board cells flipping while the board is built. */
export function Shuffle() {
  return (
    <div aria-hidden style={{ display: "flex", gap: 5, perspective: 300 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="sg-flip"
          style={{
            width: 36,
            height: 48,
            borderRadius: 4,
            background: "var(--mantine-color-mauve-9)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.22), inset 0 -3px 0 rgba(0,0,0,.35)",
            animationDelay: `${i * 110}ms`,
          }}
        />
      ))}
    </div>
  );
}
