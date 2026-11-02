import { Box, Stack, Text, Title } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { money } from "../lib/money";
import { nameOf, type RoomState } from "../lib/room";
import { Board } from "./Board";
import { Buzzer } from "./Buzzer";
import { buzzerState, canBuzz } from "./buzzerState";
import { Countdown } from "./Countdown";
import { usePickConfirm } from "./PickConfirm";
import { ANSWER_TOTAL_MS, BUZZ_WINDOW_MS } from "./timing";
import { useAnswerCapture } from "./useAnswerCapture";
import { VoicePick } from "./VoicePick";

/**
 * A contestant's controls: a status area above and the buzzer pinned below, in every phase
 * from the lobby on. The phone shows them full screen; the host device shows them at the
 * bottom of its player column (compact), where the board itself is on the stage.
 */
export function PlayerControls({
  state,
  userId,
  send,
  compact = false,
  spaceToBuzz = false,
  lobby,
  buzzerHeight,
}: {
  state: RoomState;
  userId: string;
  send: (m: ClientMessage) => void;
  compact?: boolean;
  spaceToBuzz?: boolean;
  /** What the status area shows before the game (lobby, building the board). */
  lobby?: ReactNode;
  buzzerHeight?: number;
}) {
  const capture = useAnswerCapture(state, userId, send);
  const confirm = usePickConfirm(state, userId, send);
  const [early, setEarly] = useState(false);
  const clueId = state.activeClue?.clueId;
  const lockedUntil = state.lockouts[userId];

  // Flash "Too early" when the server locks this player out.
  useEffect(() => {
    if (!lockedUntil) return;
    setEarly(true);
    const id = setTimeout(() => setEarly(false), 250);
    return () => clearTimeout(id);
  }, [lockedUntil]);

  const buzzable = canBuzz(state, userId);
  const buzz = useCallback(() => {
    if (!clueId || !buzzable) return;
    capture.begin(clueId);
    send({ type: "buzz", clueId, clientSentAt: Date.now() });
  }, [clueId, buzzable, capture, send]);

  useEffect(() => {
    if (!spaceToBuzz) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        buzz();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spaceToBuzz, buzz]);

  return (
    <Stack gap="sm" h={compact ? undefined : "100%"} justify="flex-end" aria-label="Your controls">
      <Box
        style={
          compact
            ? { flexShrink: 0 }
            : { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }
        }
      >
        <Box my="auto">
          <PlayerStatus
            state={state}
            userId={userId}
            send={send}
            compact={compact}
            lobby={lobby}
            heard={capture.heard}
            listening={capture.listening}
            onTapPick={confirm.ask}
          />
        </Box>
      </Box>
      <Buzzer state={buzzerState(state, userId, early)} onBuzz={buzz} height={buzzerHeight} />
      {confirm.modal}
    </Stack>
  );
}

function PlayerStatus({
  state,
  userId,
  send,
  compact,
  lobby,
  heard,
  listening,
  onTapPick,
}: {
  state: RoomState;
  userId: string;
  send: (m: ClientMessage) => void;
  compact: boolean;
  lobby?: ReactNode;
  heard: string;
  listening: boolean;
  onTapPick: (clueId: string) => void;
}) {
  const score = (
    <Text fw={700} aria-label="Your score">
      {money(state.scores[userId] ?? 0)}
    </Text>
  );

  if (state.phase === "lobby" || state.phase === "building_board") return <>{lobby}</>;
  // On the host device the stage already says what's happening; the column keeps only this
  // player's own business: a voice pick, the transcript, and their verdict.
  if (compact && !mine(state, userId)) return null;
  if (state.paused) return <Status compact={compact}>Waiting for the TV…</Status>;

  if (state.results) {
    const me = state.results.find((r) => r.userId === userId);
    return <Status compact={compact}>{me ? `Final: ${money(me.score)} · place ${me.placement}` : "Game over"}</Status>;
  }

  if (state.lastVerdict?.userId === userId && state.phase !== "answering") {
    const right = state.lastVerdict.verdict === "correct";
    return (
      <Status compact={compact} color={right ? "green" : "red"}>
        {right ? "✓" : "✗"} {money(state.lastVerdict.delta)}
      </Status>
    );
  }

  if (state.roundIntro) return <Status compact={compact}>Double Schmegettes!</Status>;
  if (state.clueEnd) return <Status compact={compact}>Look at the TV.</Status>;

  switch (state.phase) {
    case "board": {
      if (state.controllingUserId === userId) {
        // A spoken pick goes straight through; a tapped one is confirmed first.
        const voice = <VoicePick board={state.board} onPick={(id) => send({ type: "select_clue", clueId: id })} />;
        if (compact) return voice;
        return (
          <Stack gap="xs">
            <Board board={state.board} size="phone" onPick={onTapPick} />
            {voice}
          </Stack>
        );
      }
      // On the host device the highlighted tile already says who's picking.
      if (compact) return null;
      return (
        <Status compact={compact} extra={score}>
          {nameOf(state, state.controllingUserId) || "Someone"} is picking…
        </Status>
      );
    }
    case "clue_reading":
      return compact ? null : <Status compact={compact}>Listen…</Status>;
    case "buzzing_open":
      if (compact) return null; // the stage shows the countdown
      return (
        <Stack gap="xs">
          <Text ta="center">Buzz in!</Text>
          <Countdown deadlineAt={state.deadlineAt} total={BUZZ_WINDOW_MS} />
        </Stack>
      );
    case "answering":
      if (state.answeringUserId === userId) {
        return (
          <Stack gap="xs" align="center">
            <Text c="dimmed" aria-label="What we heard">
              {heard || (listening ? "Listening…" : "…")}
            </Text>
            <Countdown deadlineAt={state.deadlineAt} total={ANSWER_TOTAL_MS} />
          </Stack>
        );
      }
      return <Status compact={compact}>{nameOf(state, state.answeringUserId) || "Someone"} is answering…</Status>;
    default:
      return <Status compact={compact}>Look at the TV.</Status>;
  }
}

/** Whether something on screen is this player's own: their pick, answer, or verdict. */
function mine(state: RoomState, userId: string): boolean {
  if (state.paused || state.results) return false;
  if (state.lastVerdict?.userId === userId && state.phase !== "answering") return true;
  if (state.roundIntro || state.clueEnd) return false;
  if (state.phase === "board") return state.controllingUserId === userId;
  return state.phase === "answering" && state.answeringUserId === userId;
}

function Status({
  children,
  compact,
  color,
  extra,
}: {
  children: ReactNode;
  compact: boolean;
  color?: string;
  extra?: ReactNode;
}) {
  return (
    <Stack gap={4} align="center">
      <Title order={compact ? 5 : 2} c={color} ta="center">
        {children}
      </Title>
      {extra}
    </Stack>
  );
}
