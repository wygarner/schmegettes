import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { money } from "../lib/money";
import { nameOf, type RoomState } from "../lib/room";
import { BigMoment, Stage, StageBody, StageHeader } from "../ui/Stage";
import { DISPLAY } from "../ui/tokens";
import { Countdown } from "./Countdown";
import { DD_REVEAL_MS, WAGER_MS } from "./timing";
import { useSince } from "./useSince";
import { WagerPad } from "./WagerPad";

/**
 * The TV during daily_double_wager: "DAILY DOUBLE", then "Alice is wagering…", then the
 * wager. When the host plays and found it, their number pad is here on the stage (Daily
 * Double wagers are public).
 */
export function DailyDoubleStage({ state, hostWager }: { state: RoomState; hostWager?: (amount: number) => void }) {
  const clue = state.activeClue;
  const since = useSince(clue?.clueId ?? "", DD_REVEAL_MS);
  if (!clue) return null;
  const who = nameOf(state, state.controllingUserId) || "Someone";

  let body: ReactNode;
  let footer: ReactNode = null;
  if (since < DD_REVEAL_MS && state.wager === undefined) {
    body = <BigMoment>DAILY DOUBLE</BigMoment>;
  } else if (state.wager !== undefined) {
    body = (
      <>
        <Text ff={DISPLAY} fw={600} c="white" style={{ fontSize: "min(10cqh, 6cqw)" }}>
          {who} wagers {money(state.wager)}
        </Text>
        <BigMoment size="min(20cqh, 11cqw)">{money(state.wager)}</BigMoment>
      </>
    );
  } else if (hostWager) {
    body = (
      <WagerPad
        layout="stage"
        min={state.wagerMin ?? 5}
        max={state.wagerMax ?? 5}
        confirmLabel="Wager"
        onWager={hostWager}
      />
    );
    footer = <Countdown deadlineAt={state.deadlineAt} total={WAGER_MS} />;
  } else {
    body = (
      <>
        <Text ff={DISPLAY} fw={600} c="white" style={{ fontSize: "min(11cqh, 7cqw)" }}>
          {who} is wagering…
        </Text>
        {state.wagerMin !== undefined && state.wagerMax !== undefined && (
          <Text ff={DISPLAY} fw={700} c="yellow.4" style={{ fontSize: "min(8cqh, 5cqw)" }}>
            {money(state.wagerMin)} – {money(state.wagerMax)}
          </Text>
        )}
      </>
    );
    footer = <Countdown deadlineAt={state.deadlineAt} total={WAGER_MS} />;
  }

  return (
    <Stage>
      <StageHeader>{clue.category} · Daily Double</StageHeader>
      <StageBody>{body}</StageBody>
      {footer}
    </Stage>
  );
}
