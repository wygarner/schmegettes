import { Button, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { money } from "../lib/money";
import { isCorrect, nameOf, type Reveal, type RoomState } from "../lib/room";
import { BigMoment, Stage, StageBody, StageHeader } from "../ui/Stage";
import { DISPLAY, GOLD, GREEN, RED, SOFT } from "../ui/tokens";
import { ClueText } from "./ClueText";
import { Countdown } from "./Countdown";
import { FINAL_ANSWER_MS, FINAL_TITLE_MS, REVEAL_LINE_MS, REVEAL_STEP_MS, WAGER_MS } from "./timing";
import { useSince } from "./useSince";

/**
 * The TV during Final Schmegettes: the title, the category, the wager and answer countdowns,
 * then one finalist at a time, lowest score first. No wager amount or answer appears
 * before its reveal. `hostInput` is the playing host's masked wager pad or blind keypad.
 */
export function FinalStage({
  state,
  hostInput,
  onOverride,
}: {
  state: RoomState;
  hostInput?: ReactNode;
  onOverride?: (answerId: string) => void;
}) {
  const clue = state.activeClue;
  const since = useSince(state.phase, FINAL_TITLE_MS);

  let body: ReactNode = null;
  let footer: ReactNode = null;
  let input: ReactNode = null;
  if (state.phase === "final_category" && since < FINAL_TITLE_MS) {
    body = (
      <>
        <BigMoment>Final</BigMoment>
        <BigMoment>Schmegettes</BigMoment>
        <span style={HIDDEN}>FINAL SCHMEGETTES</span>
      </>
    );
  } else if (state.phase === "final_category" || state.phase === "final_wager") {
    body = (
      <>
        <Text
          c={SOFT}
          fw={700}
          tt="uppercase"
          style={{ fontSize: "clamp(10px, 4.5cqh, 18px)", letterSpacing: ".14em" }}
        >
          The Final Schmegettes category is
        </Text>
        <Text
          ff={DISPLAY}
          fw={700}
          c="white"
          tt="uppercase"
          lh={1}
          className="sg-pop"
          style={{ fontSize: hostInput ? "min(12cqh, 7cqw)" : "min(20cqh, 11cqw)" }}
        >
          {clue?.category}
        </Text>
      </>
    );
    input = hostInput;
    if (state.phase === "final_wager") footer = <Countdown deadlineAt={state.deadlineAt} total={WAGER_MS} />;
  } else if (state.phase === "final_answer") {
    body = <ClueText text={clue?.clueText ?? ""} scale={hostInput ? 0.7 : 0.8} />;
    input = hostInput;
    footer = <Countdown deadlineAt={state.deadlineAt} total={FINAL_ANSWER_MS} />;
  } else if (state.clueEnd?.correctResponse) {
    body = (
      <div>
        <Text
          c={SOFT}
          fw={700}
          tt="uppercase"
          style={{ fontSize: "clamp(10px, 4.5cqh, 18px)", letterSpacing: ".14em" }}
        >
          Correct response
        </Text>
        <Text ff={DISPLAY} fw={700} c="white" tt="uppercase" style={{ fontSize: "min(16cqh, 10cqw)" }}>
          {state.clueEnd.correctResponse}
        </Text>
      </div>
    );
  } else {
    const current = state.reveals[state.reveals.length - 1];
    body = current ? (
      <RevealView state={state} reveal={current} step={state.reveals.length} onOverride={onOverride} />
    ) : null;
  }

  return (
    <Stage>
      <StageHeader>
        Final Schmegettes{clue?.category && state.phase !== "final_category" ? ` · ${clue.category}` : ""}
      </StageHeader>
      <StageBody>{body}</StageBody>
      {input && <div style={{ flexShrink: 0, marginBottom: 8 }}>{input}</div>}
      {footer}
    </Stage>
  );
}

/** One finalist: response, verdict, wager, new score, about 2 s apart. */
function RevealView({
  state,
  reveal,
  step,
  onOverride,
}: {
  state: RoomState;
  reveal: Reveal;
  step: number;
  onOverride?: (answerId: string) => void;
}) {
  const since = useSince(`${reveal.userId}:${step}`, REVEAL_STEP_MS);
  const lines = 1 + Math.floor(since / REVEAL_LINE_MS);
  const right = isCorrect(reveal.verdict);
  const overridden = reveal.answerId !== undefined && state.overridden.includes(reveal.answerId);
  // Only the finalist on the stage can be overridden.
  const canOverride = Boolean(onOverride && reveal.answerId && state.answers[0]?.answerId === reveal.answerId);
  const before = (state.scores[reveal.userId] ?? 0) - reveal.delta;
  const after = before + reveal.delta;
  const line = (label: string, value: ReactNode) => (
    <div className="sg-in" style={{ display: "grid", gridTemplateColumns: "28cqw 1fr", alignItems: "baseline" }}>
      <span
        style={{
          color: SOFT,
          fontWeight: 700,
          fontSize: "clamp(10px, 4.6cqh, 18px)",
          textTransform: "uppercase",
          letterSpacing: ".12em",
          textAlign: "right",
          paddingRight: "3cqw",
        }}
      >
        {label}
      </span>
      {value}
    </div>
  );
  return (
    <section aria-label="Reveal" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "3cqh" }}>
      <Text ff={DISPLAY} fw={700} c="white" ta="center" tt="uppercase" style={{ fontSize: "min(9cqh, 6cqw)" }}>
        {nameOf(state, reveal.userId)} · {money(before)}
      </Text>
      {lines >= 1 &&
        line(
          "Response",
          <span style={{ fontSize: "clamp(14px, 8cqh, 34px)", fontStyle: "italic", color: "#fff" }}>
            {reveal.answer || "No answer"}
          </span>,
        )}
      {lines >= 2 &&
        line(
          "",
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {overridden && (
              <span
                style={{
                  background: GOLD,
                  color: "#1f1600",
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
            <span
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: "clamp(14px, 8cqh, 34px)",
                color: right ? GREEN : RED,
              }}
            >
              {right ? "✓ correct" : "✗ incorrect"}
            </span>
            {canOverride && (
              <Button
                size="compact-xs"
                variant="outline"
                color="boardBlue.1"
                aria-label={`Override ${nameOf(state, reveal.userId)}'s answer`}
                onClick={() => reveal.answerId && onOverride?.(reveal.answerId)}
              >
                Override
              </Button>
            )}
          </span>,
        )}
      {lines >= 3 &&
        line(
          "Wager",
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "clamp(14px, 9cqh, 38px)", color: "#fff" }}>
            {money(reveal.wager)}
          </span>,
        )}
      {lines >= 4 &&
        line(
          "Score",
          <span
            className="sg-pop"
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: "clamp(18px, 13cqh, 54px)",
              color: after < 0 ? RED : GOLD,
            }}
          >
            {money(after)}
          </span>,
        )}
    </section>
  );
}

const HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;
