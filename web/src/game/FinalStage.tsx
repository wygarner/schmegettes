import { Center, Paper, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { money } from "../lib/money";
import { nameOf, type Reveal, type RoomState } from "../lib/room";
import { Countdown } from "./Countdown";
import { FINAL_ANSWER_MS, FINAL_TITLE_MS, REVEAL_LINE_MS, REVEAL_STEP_MS, WAGER_MS } from "./timing";
import { useSince } from "./useSince";

const big = { fontSize: "clamp(20px, min(5vw, 10vh), 72px)", lineHeight: 1.15 };

/**
 * The TV during Final Schmegettes: the title, the category, the wager and answer countdowns,
 * then one finalist at a time, lowest score first. No wager amount or answer appears
 * before its reveal.
 */
export function FinalStage({ state }: { state: RoomState }) {
  const clue = state.activeClue;
  const since = useSince(state.phase, FINAL_TITLE_MS);

  let body: ReactNode = null;
  let footer: ReactNode = null;
  if (state.phase === "final_category" && since < FINAL_TITLE_MS) {
    body = (
      <Title order={1} c="yellow.4" ta="center" style={{ ...big, fontFamily: "Oswald, Impact, sans-serif" }}>
        FINAL SCHMEGETTES
      </Title>
    );
  } else if (state.phase === "final_category" || state.phase === "final_wager") {
    body = (
      <Title order={1} c="white" tt="uppercase" ta="center" style={big}>
        {clue?.category}
      </Title>
    );
    if (state.phase === "final_wager") footer = <Countdown deadlineAt={state.deadlineAt} total={WAGER_MS} />;
  } else if (state.phase === "final_answer") {
    body = (
      <Title order={1} c="white" tt="uppercase" ta="center" aria-label="Clue" style={big}>
        {clue?.clueText}
      </Title>
    );
    footer = <Countdown deadlineAt={state.deadlineAt} total={FINAL_ANSWER_MS} />;
  } else if (state.clueEnd?.correctResponse) {
    body = (
      <Stack gap={0} align="center">
        <Text c="white">Correct response:</Text>
        <Title order={1} c="white" tt="uppercase" ta="center" style={big}>
          {state.clueEnd.correctResponse}
        </Title>
      </Stack>
    );
  } else {
    const current = state.reveals[state.reveals.length - 1];
    body = current ? <RevealView state={state} reveal={current} step={state.reveals.length} /> : null;
  }

  return (
    <Paper p="md" h="100%" bg="boardBlue.9" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Text c="white" tt="uppercase" fw={700} ta="center" size="sm">
        Final Schmegettes{clue?.category && state.phase !== "final_category" ? ` · ${clue.category}` : ""}
      </Text>
      <Center style={{ flex: 1, minHeight: 0 }}>{body}</Center>
      {footer}
    </Paper>
  );
}

/** One finalist: response, verdict, wager, new score, about 2 s apart. */
function RevealView({ state, reveal, step }: { state: RoomState; reveal: Reveal; step: number }) {
  const since = useSince(`${reveal.userId}:${step}`, REVEAL_STEP_MS);
  const lines = 1 + Math.floor(since / REVEAL_LINE_MS);
  const right = reveal.verdict === "correct";
  const before = (state.scores[reveal.userId] ?? 0) - reveal.delta;
  return (
    <Stack gap={4} align="center" aria-label="Reveal">
      <Title order={2} c="white">
        {nameOf(state, reveal.userId)} · {money(before)}
      </Title>
      {lines >= 1 && (
        <Text c="white" size="xl">
          Response: <em>{reveal.answer || "No answer"}</em>
        </Text>
      )}
      {lines >= 2 && (
        <Text size="xl" fw={700} c={right ? "green" : "red"}>
          {right ? "✓ correct" : "✗ incorrect"}
        </Text>
      )}
      {lines >= 3 && (
        <Text c="white" size="xl">
          Wager: {money(reveal.wager)}
        </Text>
      )}
      {lines >= 4 && (
        <Text c="yellow.4" size="xl" fw={800}>
          Score: {money(before + reveal.delta)}
        </Text>
      )}
    </Stack>
  );
}
