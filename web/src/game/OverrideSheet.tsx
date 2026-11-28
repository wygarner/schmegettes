import { Button, Group, Stack, Text } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { money } from "../lib/money";
import { isCorrect, isVoided, nameOf, type RoomState, type Verdict } from "../lib/room";
import { Sheet } from "../ui/Sheet";
import { GREEN, SOFT } from "../ui/tokens";

/**
 * The host's review of a verdict (docs/product-docs/features/scoreboard-and-overrides/).
 * Opening it pauses the clock for everyone; the sheet says what changes before the host
 * commits. It's on the host device, so the room sees it too.
 */
export function useOverride(
  state: RoomState,
  send: (m: ClientMessage) => void,
): { ask: (answerId: string) => void; sheet: ReactNode } {
  const [target, setTarget] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const answer = target ? state.answers.find((a) => a.answerId === target) : undefined;

  // The window closed under us (the screen moved on, or the TV lost its connection).
  useEffect(() => {
    if (target && (!answer || state.paused)) setTarget(null);
  }, [target, answer, state.paused]);

  const ask = useCallback(
    (answerId: string) => {
      setTarget(answerId);
      setDone(false);
      send({ type: "override_review", open: true });
    },
    [send],
  );
  const close = useCallback(() => {
    setTarget(null);
    send({ type: "override_review", open: false });
  }, [send]);
  const apply = (correct: boolean) => {
    if (!answer?.answerId || done) return;
    setDone(true);
    send({ type: "override_verdict", answerId: answer.answerId, correct });
    close();
  };

  const sheet = (
    <Sheet opened={Boolean(answer)} onClose={close} label="Host override">
      {answer && <Review state={state} answer={answer} done={done} onKeep={close} onApply={apply} />}
    </Sheet>
  );
  return { ask, sheet };
}

function Review({
  state,
  answer,
  done,
  onKeep,
  onApply,
}: {
  state: RoomState;
  answer: Verdict;
  done: boolean;
  onKeep: () => void;
  onApply: (correct: boolean) => void;
}) {
  const name = nameOf(state, answer.userId) || "This player";
  const right = isCorrect(answer.verdict);
  const amount = Math.abs(answer.delta);
  const now = state.scores[answer.userId] ?? 0;
  const after = now - answer.delta + (right ? -amount : amount);
  const response = state.clueEnd?.correctResponse;
  const regularClue = state.phase !== "final_reveal" && !state.activeClue?.dailyDouble;
  // Marking it correct ends the clue there: it takes control, and the answers after it
  // don't count.
  const later = state.answers.slice(state.answers.indexOf(answer) + 1).filter((a) => !isVoided(a.verdict));
  const takesControl = regularClue && !right;
  const voidsLater = regularClue && !right && later.length > 0;

  return (
    <Stack gap="sm">
      <Text c="dimmed" size="xs" fw={700} tt="uppercase" style={{ letterSpacing: ".1em" }}>
        Host override · the clock is paused
      </Text>
      <div>
        <Text size="sm" c={SOFT}>
          {name} said
        </Text>
        <Text fz={22} fs="italic" fw={600}>
          {answer.answer ? `“${answer.answer}”` : "No answer heard"}
        </Text>
      </div>
      {response && (
        <div>
          <Text size="sm" c={SOFT}>
            Correct response
          </Text>
          <Text fz={22} fw={700}>
            {response}
          </Text>
        </div>
      )}
      <Text size="sm">
        Marking it {right ? "incorrect" : "correct"} gives {name}{" "}
        <b style={{ color: right ? undefined : GREEN }}>{right ? money(-amount) : `+${money(amount)}`}</b> instead of{" "}
        {right ? `+${money(amount)}` : money(-amount)} ({money(now)} → {money(after)})
        {takesControl ? ` and gives ${name} control` : ""}.
        {voidsLater ? ` The ${later.length === 1 ? "answer" : `${later.length} answers`} after it won't count.` : ""}
      </Text>
      <Group grow gap="xs">
        <Button variant="default" onClick={onKeep} disabled={done}>
          Keep {right ? "✓" : "✗"}
        </Button>
        <Button color={right ? "red" : "green"} onClick={() => onApply(!right)} disabled={done}>
          Mark {right ? "incorrect ✗" : "correct ✓"}
        </Button>
      </Group>
    </Stack>
  );
}

/** A verdict line on the TV, with the host's Override button while it can be overridden. */
export function VerdictRow({
  state,
  verdict,
  onOverride,
  small = false,
}: {
  state: RoomState;
  verdict: Verdict;
  onOverride?: (answerId: string) => void;
  small?: boolean;
}) {
  const right = isCorrect(verdict.verdict);
  const voided = isVoided(verdict.verdict);
  const overridden = verdict.answerId !== undefined && state.overridden.includes(verdict.answerId);
  return (
    <div
      className={small ? undefined : "sg-in"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: 10,
        color: voided
          ? "var(--mantine-color-gray-5)"
          : right
            ? "var(--mantine-color-teal-4)"
            : "var(--mantine-color-red-4)",
        fontWeight: 700,
        fontSize: small ? "clamp(11px, 4.6cqh, 20px)" : "clamp(14px, 7cqh, 32px)",
      }}
    >
      {voided && (
        <span
          style={{
            background: "var(--mantine-color-gray-6)",
            color: "#fff",
            fontWeight: 800,
            fontSize: "clamp(9px, 3.6cqh, 14px)",
            letterSpacing: ".1em",
            padding: "2px 7px",
            borderRadius: 4,
          }}
        >
          DOESN'T COUNT
        </span>
      )}
      {overridden && (
        <span
          style={{
            background: "var(--mantine-color-green-4)",
            color: "#140b2b",
            fontWeight: 800,
            fontSize: "clamp(9px, 3.6cqh, 14px)",
            letterSpacing: ".1em",
            padding: "2px 7px",
            borderRadius: 4,
          }}
        >
          HOST OVERRIDE
        </span>
      )}
      <span>
        {voided ? "–" : right ? "✓" : "✗"} {nameOf(state, verdict.userId)}:{" "}
        <i style={{ fontWeight: 500 }}>{verdict.answer || "no answer"}</i>
      </span>
      <span style={{ fontFamily: "Oswald, Impact, sans-serif" }}>
        {verdict.delta > 0 ? "+" : ""}
        {money(verdict.delta)}
      </span>
      {onOverride && verdict.answerId && !voided && (
        <Button
          size="compact-xs"
          variant="outline"
          color="mauve.1"
          aria-label={`Override ${nameOf(state, verdict.userId)}'s answer`}
          onClick={() => verdict.answerId && onOverride(verdict.answerId)}
        >
          Override
        </Button>
      )}
    </div>
  );
}
