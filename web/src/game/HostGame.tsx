import { Alert, Button, Center, Container, Paper, Stack, Text, Title } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { nameOf, type RoomState } from "../lib/room";
import { speak, stopSpeaking } from "../lib/speech";
import { Board } from "./Board";
import { Countdown } from "./Countdown";
import { PlayerControls } from "./PlayerControls";
import { money, ScoreBar } from "./ScoreBar";

const PICK_HINT_MS = 15000;

/** The TV during a game: board, clue, verdicts, scores. Reads each clue aloud. */
export function HostGame({
  state,
  send,
  hostUserId,
}: {
  state: RoomState;
  send: (m: ClientMessage) => void;
  hostUserId: string;
}) {
  const clue = state.activeClue;
  const spokenRef = useRef("");
  const [hint, setHint] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);

  // Read the clue aloud once per reading (a resume re-reads with a new deadline). Only a
  // reading that really ended opens buzzing early; otherwise the server's timer does, so
  // nobody can buzz before the clue has been read.
  const read = useCallback(
    (clueId: string, text: string, key: string) => {
      void speak(text).then((result) => {
        if (result === "failed") setSoundBlocked(true);
        if (result === "ended") {
          setSoundBlocked(false);
          if (spokenRef.current === key) send({ type: "reading_done", clueId });
        }
      });
    },
    [send],
  );

  useEffect(() => {
    if (state.phase !== "clue_reading" || state.paused || !clue?.clueText) return;
    const key = `${clue.clueId}:${state.deadlineAt}`;
    if (spokenRef.current === key) return;
    spokenRef.current = key;
    read(clue.clueId, clue.clueText, key);
  }, [state.phase, state.paused, state.deadlineAt, clue?.clueId, clue?.clueText, read]);

  // The tap is the user gesture the browser wants before it plays sound.
  const unblockSound = () => {
    setSoundBlocked(false);
    if (state.phase === "clue_reading" && clue?.clueText) read(clue.clueId, clue.clueText, spokenRef.current);
    else void speak("Sound on");
  };

  useEffect(() => {
    if (state.phase !== "clue_reading") stopSpeaking();
  }, [state.phase]);

  // After 15 s without a pick, remind the room that the host can pick.
  useEffect(() => {
    setHint(false);
    if (state.phase !== "board" || state.roundIntro || !state.controllingUserId) return;
    const id = setTimeout(() => setHint(true), PICK_HINT_MS);
    return () => clearTimeout(id);
  }, [state.phase, state.roundIntro, state.controllingUserId]);

  const playerBar = state.hostPlays && !state.results && (
    <Paper p="sm" withBorder aria-label="Your controls">
      <PlayerControls state={state} userId={hostUserId} send={send} compact spaceToBuzz />
    </Paper>
  );

  let main: ReactNode;
  if (state.results) {
    main = (
      <Stack align="center">
        <Title order={1}>Final scores</Title>
        {state.results.map((r) => (
          <Title order={2} key={r.userId}>
            {r.placement}. {r.displayName} {money(r.score)}
          </Title>
        ))}
      </Stack>
    );
  } else if (state.roundIntro && state.phase !== "clue_reading") {
    main = <Title order={1}>Double Jeopardy!</Title>;
  } else if (clue && state.phase !== "board") {
    main = <ClueView state={state} />;
  } else {
    main = (
      <Stack>
        <Board board={state.board} onPick={(id) => send({ type: "select_clue", clueId: id })} />
        <Text ta="center">
          Waiting for {nameOf(state, state.controllingUserId) || "a player"} to pick…
          {hint && " The host can tap a clue to pick."}
        </Text>
      </Stack>
    );
  }

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        {state.paused && <Alert color="yellow">Paused: waiting for the TV to reconnect…</Alert>}
        {soundBlocked && (
          <Button color="yellow" onClick={unblockSound}>
            Tap to turn on sound
          </Button>
        )}
        <Center mih="60vh">{main}</Center>
        <ScoreBar state={state} />
        {playerBar}
      </Stack>
    </Container>
  );
}

function ClueView({ state }: { state: RoomState }) {
  const clue = state.activeClue;
  if (!clue) return null;
  const verdict = state.lastVerdict;
  return (
    <Paper
      p="xl"
      w="100%"
      bg="boardBlue.9"
      style={{ border: state.phase === "buzzing_open" ? "4px solid var(--mantine-color-yellow-4)" : undefined }}
    >
      <Stack align="center" gap="lg">
        <Text c="white" tt="uppercase" fw={700}>
          {clue.category} · ${clue.value}
        </Text>
        <Title order={1} c="white" tt="uppercase" ta="center" aria-label="Clue">
          {clue.clueText}
        </Title>
        {state.phase === "buzzing_open" && <Countdown deadlineAt={state.deadlineAt} total={5000} />}
        {state.phase === "answering" && (
          <Text c="white" size="xl">
            {nameOf(state, state.answeringUserId)}: <em>{state.liveText || "listening…"}</em>
          </Text>
        )}
        {verdict && (
          <Text size="xl" fw={700} c={verdict.verdict === "correct" ? "green" : "red"}>
            {verdict.verdict === "correct" ? "✓" : "✗"} {nameOf(state, verdict.userId)}:{" "}
            <em>{verdict.answer || "(no answer)"}</em> {money(verdict.delta)}
          </Text>
        )}
        {state.clueEnd?.correctResponse && (
          <Text c="white" size="xl">
            Correct response: <strong>{state.clueEnd.correctResponse}</strong>
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
