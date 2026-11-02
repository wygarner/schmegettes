import { Alert, Box, Button, Center, Paper, Stack, Text, Title } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { money } from "../lib/money";
import { nameOf, type RoomState } from "../lib/room";
import { announcement, speak, stopSpeaking } from "../lib/speech";
import { Board } from "./Board";
import { Countdown } from "./Countdown";
import { HostLayout } from "./HostLayout";
import { usePickConfirm } from "./PickConfirm";
import { PlayerColumn } from "./PlayerColumn";
import { PlayerControls } from "./PlayerControls";
import { BUZZ_WINDOW_MS } from "./timing";

/**
 * The host device during a game, mirrored to the TV: the board or clue on the stage, every
 * score in the player column. Reads each pick aloud ("Here's SCIENCE for 400.") and then the
 * clue. The board is tappable only when the host plays and has control.
 */
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
  const [soundBlocked, setSoundBlocked] = useState(false);
  const confirm = usePickConfirm(state, hostUserId, send);

  // Read the announcement and clue aloud, as one utterance, once per reading (a resume
  // re-reads with a new deadline). Only a reading that really ended opens buzzing early;
  // otherwise the server's timer does, so nobody can buzz before the clue has been read.
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
  const reading = clue?.clueText ? `${announcement(clue.category, clue.value)} ${clue.clueText}` : "";

  useEffect(() => {
    if (state.phase !== "clue_reading" || state.paused || !clue || !reading) return;
    const key = `${clue.clueId}:${state.deadlineAt}`;
    if (spokenRef.current === key) return;
    spokenRef.current = key;
    read(clue.clueId, reading, key);
  }, [state.phase, state.paused, state.deadlineAt, clue, reading, read]);

  // The tap is the user gesture the browser wants before it plays sound.
  const unblockSound = () => {
    setSoundBlocked(false);
    if (state.phase === "clue_reading" && clue && reading) read(clue.clueId, reading, spokenRef.current);
    else void speak("Sound on");
  };

  useEffect(() => {
    if (state.phase !== "clue_reading") stopSpeaking();
  }, [state.phase]);

  const hostPicks = state.hostPlays && state.controllingUserId === hostUserId;

  let main: ReactNode;
  if (state.results) {
    main = (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <Title order={1}>Final scores</Title>
          {state.results.map((r) => (
            <Title order={2} key={r.userId}>
              {r.placement}. {r.displayName} {money(r.score)}
            </Title>
          ))}
        </Stack>
      </Center>
    );
  } else if (state.roundIntro && state.phase !== "clue_reading") {
    main = (
      <Center h="100%">
        <Title order={1}>Double Schmegettes!</Title>
      </Center>
    );
  } else if (clue && state.phase !== "board") {
    main = <ClueView state={state} />;
  } else {
    main = <Board board={state.board} onPick={hostPicks ? confirm.ask : undefined} />;
  }

  const stage = (
    <>
      {state.paused && (
        <Alert color="yellow" mb={8} p={8}>
          Paused: waiting for the TV to reconnect…
        </Alert>
      )}
      {soundBlocked && (
        <Button color="yellow" mb={8} onClick={unblockSound}>
          Tap to turn on sound
        </Button>
      )}
      <Box style={{ flex: 1, minHeight: 0 }}>{main}</Box>
      {confirm.modal}
    </>
  );

  const column = (
    <>
      <Box style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <PlayerColumn state={state} />
      </Box>
      {state.hostPlays && !state.results && (
        <PlayerControls state={state} userId={hostUserId} send={send} compact spaceToBuzz />
      )}
    </>
  );

  return <HostLayout stage={stage} column={column} />;
}

function ClueView({ state }: { state: RoomState }) {
  const clue = state.activeClue;
  if (!clue) return null;
  const verdict = state.lastVerdict;
  const ended = state.clueEnd;
  return (
    <Paper
      p="md"
      h="100%"
      bg="boardBlue.9"
      style={{
        border: `4px solid ${state.phase === "buzzing_open" && !ended ? "var(--mantine-color-yellow-4)" : "transparent"}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Text c="white" tt="uppercase" fw={700} ta="center" size="sm">
        {clue.category} · {money(clue.value)}
      </Text>
      <Stack align="center" justify="center" gap="sm" style={{ flex: 1, minHeight: 0 }}>
        {/* The correct-response screen leaves the clue out. */}
        {!ended && (
          <Title
            order={1}
            c="white"
            tt="uppercase"
            ta="center"
            aria-label="Clue"
            style={{ fontSize: "clamp(16px, min(3.4vw, 7vh), 56px)", lineHeight: 1.2 }}
          >
            {clue.clueText}
          </Title>
        )}
        {state.phase === "answering" && !ended && (
          <Text c="white" size="lg">
            {nameOf(state, state.answeringUserId)}: <em>{state.liveText || "listening…"}</em>
          </Text>
        )}
        {verdict && (
          <Text size="lg" fw={700} c={verdict.verdict === "correct" ? "green" : "red"} ta="center">
            {verdict.verdict === "correct" ? "✓" : "✗"} {nameOf(state, verdict.userId)}:{" "}
            <em>{verdict.answer || "(no answer)"}</em> {money(verdict.delta)}
          </Text>
        )}
        {ended?.correctResponse && (
          <Stack gap={0} align="center">
            <Text c="white">Correct response:</Text>
            <Title
              order={1}
              c="white"
              tt="uppercase"
              ta="center"
              style={{ fontSize: "clamp(20px, min(4vw, 9vh), 64px)" }}
            >
              {ended.correctResponse}
            </Title>
          </Stack>
        )}
      </Stack>
      {state.phase === "buzzing_open" && !ended && <Countdown deadlineAt={state.deadlineAt} total={BUZZ_WINDOW_MS} />}
    </Paper>
  );
}
