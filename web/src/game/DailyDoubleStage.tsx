import { Center, Paper, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { money } from "../lib/money";
import { nameOf, type RoomState } from "../lib/room";
import { Countdown } from "./Countdown";
import { DD_REVEAL_MS, WAGER_MS } from "./timing";
import { useSince } from "./useSince";

/** The TV during daily_double_wager: "DAILY DOUBLE", then "Alice is wagering…", then the wager. */
export function DailyDoubleStage({ state }: { state: RoomState }) {
  const clue = state.activeClue;
  const since = useSince(clue?.clueId ?? "", DD_REVEAL_MS);
  if (!clue) return null;
  const who = nameOf(state, state.controllingUserId) || "Someone";

  let body: ReactNode;
  if (since < DD_REVEAL_MS && state.wager === undefined) {
    body = (
      <Title
        order={1}
        c="yellow.4"
        ta="center"
        style={{ fontFamily: "Oswald, Impact, sans-serif", fontSize: "clamp(32px, min(9vw, 18vh), 120px)" }}
      >
        DAILY DOUBLE
      </Title>
    );
  } else if (state.wager !== undefined) {
    body = (
      <Title order={1} c="white" ta="center">
        {who} wagers {money(state.wager)}
      </Title>
    );
  } else {
    body = (
      <Stack align="center" gap="xs" w="100%">
        <Title order={1} c="white" ta="center">
          {who} is wagering…
        </Title>
        {state.wagerMin !== undefined && state.wagerMax !== undefined && (
          <Text c="white" size="lg">
            {money(state.wagerMin)} – {money(state.wagerMax)}
          </Text>
        )}
        <Countdown deadlineAt={state.deadlineAt} total={WAGER_MS} />
      </Stack>
    );
  }

  return (
    <Paper p="md" h="100%" bg="boardBlue.9" style={{ display: "flex", flexDirection: "column" }}>
      <Text c="white" tt="uppercase" fw={700} ta="center" size="sm">
        {clue.category} · Daily Double
      </Text>
      <Center style={{ flex: 1, minHeight: 0 }}>{body}</Center>
    </Paper>
  );
}
