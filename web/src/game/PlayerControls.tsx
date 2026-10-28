import { Group, Stack, Text, Title } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { nameOf, type RoomState } from "../lib/room";
import { Board } from "./Board";
import { Buzzer, type BuzzerState } from "./Buzzer";
import { Countdown } from "./Countdown";
import { money } from "./ScoreBar";
import { useAnswerCapture } from "./useAnswerCapture";

/**
 * A contestant's controls: pick when in control, buzz, answer out loud. The phone shows
 * them full screen; the host device shows them in the player bar (compact).
 */
export function PlayerControls({
  state,
  userId,
  send,
  compact = false,
  spaceToBuzz = false,
}: {
  state: RoomState;
  userId: string;
  send: (m: ClientMessage) => void;
  compact?: boolean;
  spaceToBuzz?: boolean;
}) {
  const capture = useAnswerCapture(state, userId, send);
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

  const tried = state.attemptedUserIds.includes(userId);
  // After a clue ends (correct response on the TV) or between rounds, the phase hasn't
  // moved on yet, but nobody can buzz.
  const between = Boolean(state.clueEnd || state.roundIntro);
  const buzzable =
    (state.phase === "clue_reading" || state.phase === "buzzing_open") && !tried && !state.paused && !between;

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

  const score = (
    <Text fw={700} aria-label="Your score">
      {money(state.scores[userId] ?? 0)}
    </Text>
  );

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

  if (state.roundIntro) return <Status compact={compact}>Double Jeopardy!</Status>;
  if (state.clueEnd) return <Status compact={compact}>Look at the TV.</Status>;

  switch (state.phase) {
    case "board": {
      if (state.roundIntro) return <Status compact={compact}>Double Jeopardy!</Status>;
      if (state.controllingUserId === userId) {
        return (
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>Your pick</Text>
              {score}
            </Group>
            {!compact && (
              <Board board={state.board} size="phone" onPick={(id) => send({ type: "select_clue", clueId: id })} />
            )}
            {compact && <Text size="sm">Tap a clue on the board.</Text>}
          </Stack>
        );
      }
      return (
        <Status compact={compact} extra={score}>
          {nameOf(state, state.controllingUserId) || "Someone"} is picking…
        </Status>
      );
    }
    case "clue_reading":
    case "buzzing_open": {
      const look: BuzzerState = tried ? "locked" : early ? "early" : state.phase === "buzzing_open" ? "lit" : "dim";
      return (
        <Stack gap="xs">
          {!compact && <Text ta="center">{state.phase === "clue_reading" ? "Listen…" : "Buzz in!"}</Text>}
          <Buzzer state={look} onBuzz={buzz} compact={compact} />
          {state.phase === "buzzing_open" && <Countdown deadlineAt={state.deadlineAt} total={5000} />}
          {compact && score}
        </Stack>
      );
    }
    case "answering":
      if (state.answeringUserId === userId) {
        return (
          <Stack gap="xs" align="center">
            <Title order={compact ? 4 : 2}>Answer now</Title>
            <Text c="dimmed" aria-label="What we heard">
              {capture.heard || (capture.listening ? "Listening…" : "…")}
            </Text>
            <Countdown deadlineAt={state.deadlineAt} total={8500} />
          </Stack>
        );
      }
      return <Status compact={compact}>{nameOf(state, state.answeringUserId) || "Someone"} is answering…</Status>;
    default:
      return <Status compact={compact}>Look at the TV.</Status>;
  }
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
      <Title order={compact ? 4 : 2} c={color} ta="center">
        {children}
      </Title>
      {extra}
    </Stack>
  );
}
