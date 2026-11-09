import { Alert, Box, Button, Center, Paper, Stack, Text, Title } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { money } from "../lib/money";
import { inFinal, nameOf, type RoomState } from "../lib/room";
import {
  announcement,
  DAILY_DOUBLE_INTRO,
  dailyDoubleAnnouncement,
  finalAnnouncement,
  speak,
  stopSpeaking,
} from "../lib/speech";
import { Board } from "./Board";
import { Countdown } from "./Countdown";
import { DailyDoubleStage } from "./DailyDoubleStage";
import { FinalStage } from "./FinalStage";
import { HostLayout } from "./HostLayout";
import { usePickConfirm } from "./PickConfirm";
import { PlayerColumn } from "./PlayerColumn";
import { PlayerControls } from "./PlayerControls";
import { BUZZ_WINDOW_MS, FINAL_SKIPPED_MS } from "./timing";
import { useSince } from "./useSince";

/** Something the TV says. reportDone: tell the server when it ends (reading_done). */
interface Speech {
  key: string;
  text: string;
  clueId: string;
  reportDone: boolean;
}

/** What the TV should be saying in this phase, if anything. */
function currentSpeech(state: RoomState): Speech | null {
  const clue = state.activeClue;
  if (!clue) return null;
  switch (state.phase) {
    case "clue_reading": {
      if (!clue.clueText) return null;
      const intro =
        clue.dailyDouble && state.wager !== undefined
          ? dailyDoubleAnnouncement(state.wager)
          : announcement(clue.category, clue.value);
      // A resume re-reads with a new deadline.
      return {
        key: `read:${clue.clueId}:${state.deadlineAt}`,
        text: `${intro} ${clue.clueText}`,
        clueId: clue.clueId,
        reportDone: true,
      };
    }
    case "daily_double_wager":
      if (state.wager !== undefined) return null;
      return { key: `dd:${clue.clueId}`, text: DAILY_DOUBLE_INTRO, clueId: clue.clueId, reportDone: false };
    case "final_category":
      return {
        key: `category:${clue.clueId}:${state.deadlineAt}`,
        text: finalAnnouncement(clue.category),
        clueId: clue.clueId,
        reportDone: true,
      };
    case "final_answer":
      // Read once; the window opening (a new deadline) doesn't read it again. A pause does.
      if (!clue.clueText) return null;
      return { key: `final:${clue.clueId}`, text: clue.clueText, clueId: clue.clueId, reportDone: true };
    default:
      return null;
  }
}

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

  // Say each announcement and clue once per showing. Only a reading that really ended
  // reports reading_done; otherwise the server's timer moves on, so nobody can buzz (or
  // the Final can't start) before the room has heard it.
  const say = useCallback(
    (speech: Speech) => {
      void speak(speech.text).then((result) => {
        if (result === "failed") setSoundBlocked(true);
        if (result === "ended") {
          setSoundBlocked(false);
          if (speech.reportDone && spokenRef.current === speech.key)
            send({ type: "reading_done", clueId: speech.clueId });
        }
      });
    },
    [send],
  );
  const speech = currentSpeech(state);
  const speechKey = speech?.key ?? "";
  // speech is rebuilt every render; its key says when it changed.
  const speechRef = useRef(speech);
  speechRef.current = speech;

  useEffect(() => {
    if (state.paused) {
      spokenRef.current = ""; // the server reads again on resume
      return;
    }
    const current = speechRef.current;
    if (!speechKey || !current || spokenRef.current === speechKey) return;
    spokenRef.current = speechKey;
    say(current);
  }, [speechKey, state.paused, say]);

  // The tap is the user gesture the browser wants before it plays sound.
  const unblockSound = () => {
    setSoundBlocked(false);
    if (speech) say(speech);
    else void speak("Sound on");
  };

  useEffect(() => {
    if (!speechKey) stopSpeaking();
  }, [speechKey]);

  const skipSince = useSince(state.finalSkipped ? "skipped" : "", FINAL_SKIPPED_MS);

  const hostPicks = state.hostPlays && state.controllingUserId === hostUserId;

  let main: ReactNode;
  if (state.results && state.finalSkipped && skipSince < FINAL_SKIPPED_MS) {
    main = (
      <Center h="100%">
        <Title order={2} ta="center">
          Nobody's in the black: no Final Schmegettes.
        </Title>
      </Center>
    );
  } else if (state.results) {
    main = (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <Title order={1}>Final scores</Title>
          {state.results.map((r) => (
            <Title order={2} key={r.userId}>
              {r.placement}. {r.displayName} {money(r.score)}
              {r.placement === 1 && " 🏆"}
            </Title>
          ))}
        </Stack>
      </Center>
    );
  } else if (state.phase === "daily_double_wager") {
    main = <DailyDoubleStage state={state} />;
  } else if (inFinal(state.phase)) {
    main = <FinalStage state={state} />;
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
        {clue.category} ·{" "}
        {clue.dailyDouble && state.wager !== undefined ? `DD ${money(state.wager)}` : money(clue.value)}
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
