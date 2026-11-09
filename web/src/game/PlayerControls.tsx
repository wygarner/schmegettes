import { Box, Button, Text } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { money } from "../lib/money";
import { inFinal, isCorrect, nameOf, type RoomState } from "../lib/room";
import { Meter } from "../ui/Meter";
import { DISPLAY, GOLD, GREEN, RED, SOFT } from "../ui/tokens";
import { Board } from "./Board";
import { Buzzer } from "./Buzzer";
import { buzzerState, canBuzz, canPick } from "./buzzerState";
import { Countdown } from "./Countdown";
import { FinalAnswerField } from "./FinalAnswerField";
import { usePickConfirm } from "./PickConfirm";
import { ordinal, PLACE_COLOR } from "./Scoreboard";
import { ANSWER_TOTAL_MS, BUZZ_WINDOW_MS, WAGER_MS } from "./timing";
import { useAnswerCapture } from "./useAnswerCapture";
import { useVoicePick, type VoicePick } from "./VoicePick";
import { WagerPad } from "./WagerPad";

/**
 * A contestant's controls: a status area above and the buzzer pinned below, in every phase
 * from the lobby on. The phone shows them full screen; the host device shows them at the
 * bottom of its player column (compact), where the board, the wager pads and the Final
 * keypad are on the stage instead.
 *
 * On the board, the player in control picks by tapping a clue or by pressing the buzzer and
 * saying it: the buzzer is their microphone button.
 */
export function PlayerControls({
  state,
  userId,
  send,
  compact = false,
  spaceToBuzz = false,
  lobby,
  buzzerHeight,
  onLeave,
}: {
  state: RoomState;
  userId: string;
  send: (m: ClientMessage) => void;
  compact?: boolean;
  spaceToBuzz?: boolean;
  /** What the status area shows before the game (lobby, building the board). */
  lobby?: ReactNode;
  buzzerHeight?: number;
  /** Leave the room from the final scoreboard. */
  onLeave?: () => void;
}) {
  const capture = useAnswerCapture(state, userId, send);
  const confirm = usePickConfirm(state, userId, send, { bottom: !compact });
  const voice = useVoicePick(state.board, (clueId) => send({ type: "select_clue", clueId }));
  const [early, setEarly] = useState(false);
  const clueId = state.activeClue?.clueId;
  const lockedUntil = state.lockouts[userId];
  const picking = canPick(state, userId);

  // Flash "Too early" when the server locks this player out.
  useEffect(() => {
    if (!lockedUntil) return;
    setEarly(true);
    const id = setTimeout(() => setEarly(false), 250);
    return () => clearTimeout(id);
  }, [lockedUntil]);

  // A spoken pick stops listening when the board goes away or control moves.
  const { cancel: cancelVoice, toggle: toggleVoice } = voice;
  useEffect(() => {
    if (!picking) cancelVoice();
  }, [picking, cancelVoice]);

  const buzzable = canBuzz(state, userId);
  const press = useCallback(() => {
    if (picking) {
      toggleVoice();
      return;
    }
    if (!clueId || !buzzable) return;
    capture.begin(clueId);
    send({ type: "buzz", clueId, clientSentAt: Date.now() });
  }, [picking, toggleVoice, clueId, buzzable, capture, send]);

  useEffect(() => {
    if (!spaceToBuzz) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      e.preventDefault();
      press();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spaceToBuzz, press]);

  const status = (
    <PlayerStatus
      state={state}
      userId={userId}
      send={send}
      compact={compact}
      lobby={lobby}
      heard={capture.heard}
      listening={capture.listening}
      voice={voice}
      onTapPick={confirm.ask}
      onLeave={onLeave}
    />
  );
  const buzzer = (
    <Buzzer state={buzzerState(state, userId, early, voice.listening)} onBuzz={press} height={buzzerHeight ?? 120} />
  );

  if (compact) {
    return (
      <section aria-label="Your controls" style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        {status}
        {buzzer}
        {confirm.modal}
      </section>
    );
  }

  const inGame = state.phase !== "lobby" && state.phase !== "building_board";
  const me = state.players.find((p) => p.userId === userId);
  const hint = picking
    ? voice.listening
      ? "Listening… press again to cancel"
      : "Tap a clue, or press and say it"
    : undefined;
  return (
    <section aria-label="Your controls" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {inGame && (
        <div
          style={{
            height: 36,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".1em",
              color: "#a5abee",
              textTransform: "uppercase",
            }}
          >
            {me?.displayName}
          </span>
          {/* No score while picking: the board needs the room. */}
          {!picking && (
            <output
              aria-label="Your score"
              style={{
                fontFamily: DISPLAY,
                fontWeight: 600,
                fontSize: 22,
                color: (state.scores[userId] ?? 0) < 0 ? RED : GOLD,
              }}
            >
              {money(state.scores[userId] ?? 0)}
            </output>
          )}
        </div>
      )}
      <Box style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <Box my="auto" py="xs" w="100%">
          {status}
        </Box>
      </Box>
      <div style={{ flexShrink: 0, paddingTop: 10 }}>
        {buzzer}
        {hint && (
          <Text ta="center" size="xs" c="rgba(201,205,247,.75)" mt={8}>
            {hint}
          </Text>
        )}
      </div>
      {confirm.modal}
    </section>
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
  voice,
  onTapPick,
  onLeave,
}: {
  state: RoomState;
  userId: string;
  send: (m: ClientMessage) => void;
  compact: boolean;
  lobby?: ReactNode;
  heard: string;
  listening: boolean;
  voice: VoicePick;
  onTapPick: (clueId: string) => void;
  onLeave?: () => void;
}) {
  if (state.phase === "lobby" || state.phase === "building_board") return <>{lobby}</>;
  // On the host device the stage already says what's happening, and the host's wager pads
  // and Final keypad are on the stage; the column keeps only voice-pick problems and the
  // host's own verdict.
  if (compact) return <CompactStatus state={state} userId={userId} voice={voice} />;
  if (state.paused) return <Status sub="The game picks up where it left off.">Waiting for the TV…</Status>;

  if (state.results) return <GameOver state={state} userId={userId} onLeave={onLeave} />;

  // The host is reviewing this player's answer: the clock is paused.
  if (state.review?.open && state.review.userIds.includes(userId)) {
    return <Status sub="The clock is paused.">{state.hostDisplayName} is reviewing your answer…</Status>;
  }
  const override = state.lastOverride;
  if (override?.userId === userId && (state.clueEnd || state.phase === "final_reveal")) {
    const right = isCorrect(override.verdict);
    return (
      <div className="sg-pop" style={{ textAlign: "center" }}>
        <Text c="yellow.4" fw={800} size="xs" style={{ letterSpacing: ".14em" }}>
          HOST OVERRIDE
        </Text>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 88, lineHeight: 1, color: right ? GREEN : RED }}>
          {right ? "✓" : "✗"}
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, color: right ? GREEN : RED }}>
          {override.delta > 0 ? "+" : ""}
          {money(override.delta)}
        </div>
        <Text size="sm" c={SOFT}>
          {state.hostDisplayName} changed your answer to {right ? "correct" : "incorrect"}.
        </Text>
      </div>
    );
  }

  if (state.lastVerdict?.userId === userId && state.phase !== "answering") {
    const right = isCorrect(state.lastVerdict.verdict);
    return (
      <div className="sg-pop" style={{ textAlign: "center", color: right ? GREEN : RED }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, lineHeight: 1 }}>{right ? "✓" : "✗"}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 44 }}>
          {state.lastVerdict.delta > 0 ? "+" : ""}
          {money(state.lastVerdict.delta)}
        </div>
      </div>
    );
  }

  if (state.roundIntro) return <Status sub="Values double. Look at the TV.">Double Schmegettes!</Status>;
  if (state.clueEnd) return <Status>Look at the TV.</Status>;
  if (inFinal(state.phase)) return <FinalStatus state={state} userId={userId} send={send} />;
  const dailyDouble = Boolean(state.activeClue?.dailyDouble);

  switch (state.phase) {
    case "daily_double_wager": {
      const who = nameOf(state, state.controllingUserId) || "Someone";
      if (state.controllingUserId !== userId)
        return <Status sub="Daily Double. Look at the TV.">{who} is wagering…</Status>;
      if (state.wager !== undefined) return <Status>Wager locked: {money(state.wager)}</Status>;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Text ta="center" ff={DISPLAY} fw={700} c="yellow.4" fz={24} tt="uppercase">
            Daily Double! {state.activeClue?.category}
          </Text>
          <WagerPad
            min={state.wagerMin ?? 5}
            max={state.wagerMax ?? 5}
            confirmLabel="Wager"
            onWager={(amount) => send({ type: "submit_wager", amount })}
          />
          <Countdown deadlineAt={state.deadlineAt} total={WAGER_MS} height={4} />
        </div>
      );
    }
    case "board": {
      if (state.controllingUserId === userId) {
        // A spoken pick goes straight through; a tapped one is confirmed first.
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Board board={state.board} size="phone" onPick={onTapPick} />
            <VoiceFeedback voice={voice} />
          </div>
        );
      }
      return <Status sub="Look at the TV.">{nameOf(state, state.controllingUserId) || "Someone"} is picking…</Status>;
    }
    case "clue_reading":
      if (dailyDouble && state.controllingUserId === userId) {
        return <Status sub="Nobody else can buzz.">Listen… you'll answer when the clue ends.</Status>;
      }
      if (dailyDouble) {
        return (
          <Status sub="Look at the TV.">
            {nameOf(state, state.controllingUserId) || "Someone"} is answering a Daily Double.
          </Status>
        );
      }
      return (
        <Status
          sub={
            state.attemptedUserIds.includes(userId)
              ? "You've answered this one."
              : "Buzz when it lights up. Too early locks you out for a moment."
          }
        >
          Listen…
        </Status>
      );
    case "buzzing_open":
      if (state.attemptedUserIds.includes(userId))
        return <Status sub="You've answered this one.">Others can buzz now</Status>;
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Text ff={DISPLAY} fw={700} fz={64} lh={1} c="yellow.4" className="sg-pop">
            BUZZ IN!
          </Text>
          <Countdown deadlineAt={state.deadlineAt} total={BUZZ_WINDOW_MS} height={10} />
        </div>
      );
    case "answering":
      if (state.answeringUserId === userId) {
        return (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
            <Text ff={DISPLAY} fw={600} fz={34} lh={1.1}>
              Say your answer
            </Text>
            <Meter color="var(--mantine-color-green-5)" height={44} />
            <Text fz={22} fs="italic" mih={60} aria-label="What we heard">
              {heard ? `“${heard}”` : <span style={{ color: "#7f87e6" }}>{listening ? "Listening…" : "…"}</span>}
            </Text>
            <Countdown deadlineAt={state.deadlineAt} total={ANSWER_TOTAL_MS} color="var(--mantine-color-green-6)" />
            <Text size="sm" c={SOFT}>
              “What is” is optional. It stops when you go quiet.
            </Text>
          </div>
        );
      }
      return <Status sub="Look at the TV.">{nameOf(state, state.answeringUserId) || "Someone"} is answering…</Status>;
    default:
      return <Status>Look at the TV.</Status>;
  }
}

/** The host device's column: only what's the host's own and not already on the stage. */
function CompactStatus({ state, userId, voice }: { state: RoomState; userId: string; voice: VoicePick }) {
  if (state.paused || state.results) return null;
  if (canPick(state, userId) && voice.problem) {
    return (
      <Text size="xs" c="red.3" ta="center">
        {voice.problem}
      </Text>
    );
  }
  if (state.lastVerdict?.userId === userId && state.phase !== "answering" && !state.clueEnd && !state.roundIntro) {
    const right = isCorrect(state.lastVerdict.verdict);
    return (
      <Text ta="center" fw={700} ff={DISPLAY} c={right ? "green.4" : "red.4"}>
        {right ? "✓" : "✗"} {money(state.lastVerdict.delta)}
      </Text>
    );
  }
  return null;
}

/** What a spoken pick heard, or why it picked nothing. The buzzer itself starts and stops it. */
function VoiceFeedback({ voice }: { voice: VoicePick }) {
  if (voice.listening) {
    return (
      <div
        style={{
          padding: 14,
          borderRadius: 16,
          background: "rgba(64,192,87,.10)",
          border: "1px solid rgba(64,192,87,.4)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Meter height={26} color="var(--mantine-color-green-5)" />
        <div style={{ flex: 1 }}>
          <Text fw={700}>Listening…</Text>
          <Text size="xs" c={SOFT} aria-label="What we heard">
            {voice.heard ? `“${voice.heard}”` : "Say a category and value, like “Opera for 600”"}
          </Text>
        </div>
      </div>
    );
  }
  if (!voice.problem) return null;
  return (
    <Text c="red.3" fw={600} ta="center" size="sm">
      {voice.problem} Press the buzzer to try again, or tap a clue.
    </Text>
  );
}

/** The final scoreboard on a phone: my placement and score, the standings, and Leave. */
function GameOver({ state, userId, onLeave }: { state: RoomState; userId: string; onLeave?: () => void }) {
  const results = state.results ?? [];
  const me = results.find((r) => r.userId === userId);
  if (!me) return <Status sub="Look at the TV.">Game over</Status>;
  const top = results[0]?.score ?? 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ textAlign: "center" }}>
        <Text c={SOFT} fw={700} tt="uppercase" style={{ letterSpacing: ".14em" }}>
          You finished
        </Text>
        <Text ff={DISPLAY} fw={700} fz={88} lh={1} c={PLACE_COLOR[me.placement] ?? "white"} className="sg-pop">
          {ordinal(me.placement)}
        </Text>
        <Text ff={DISPLAY} fw={600} fz={32} c={me.score < 0 ? "red.4" : "white"}>
          {money(me.score)} {me.score === top && "🏆"}
        </Text>
      </div>
      <ol
        aria-label="Standings"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}
      >
        {results.map((r) => {
          const mine = r.userId === userId;
          return (
            <li
              key={r.userId}
              aria-current={mine ? "true" : undefined}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: 10,
                background: mine ? "rgba(255,212,59,.1)" : "rgba(255,255,255,.04)",
                border: mine ? "1px solid rgba(255,212,59,.4)" : "1px solid transparent",
              }}
            >
              <span style={{ display: "flex", gap: 12 }}>
                <span style={{ width: 34, fontWeight: 800, fontSize: 14, color: "#a5abee" }}>
                  {ordinal(r.placement)}
                </span>
                <span style={{ fontWeight: 700 }}>{r.displayName}</span>
              </span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, color: r.score < 0 ? RED : GOLD }}>
                {money(r.score)}
              </span>
            </li>
          );
        })}
      </ol>
      <Text size="sm" c={SOFT} ta="center">
        Waiting for {state.hostDisplayName}: stay for a rematch, or leave.
      </Text>
      {onLeave && (
        <Button variant="subtle" color="red" onClick={onLeave}>
          Leave
        </Button>
      )}
    </div>
  );
}

/** A player's Final Schmegettes on their phone: a secret wager, then a typed answer. */
function FinalStatus({ state, userId, send }: { state: RoomState; userId: string; send: (m: ClientMessage) => void }) {
  const clue = state.activeClue;
  if (!state.finalistUserIds.includes(userId)) {
    return <Status sub="Only players above $0 play Final Schmegettes.">You're not in Final. Watch the TV.</Status>;
  }
  const locked = state.lockedUserIds.includes(userId);
  const score = state.scores[userId] ?? 0;

  if (state.phase === "final_category" || state.phase === "final_wager") {
    if (locked) {
      if (state.mine.wager === undefined) return <Status>✓ Wager locked</Status>;
      return <Status sub="Nobody else can see this.">Wager locked: {money(state.mine.wager)}. Look at the TV.</Status>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ textAlign: "center" }}>
          <Text c="boardBlue.1" size="xs" fw={700} tt="uppercase" style={{ letterSpacing: ".14em" }}>
            Final: {clue?.category}
          </Text>
          <Text size="sm" c={SOFT}>
            Bet up to your whole score. It's secret.
          </Text>
        </div>
        <WagerPad
          min={0}
          max={Math.max(0, score)}
          confirmLabel="Lock in"
          onWager={(amount) => send({ type: "submit_wager", amount })}
        />
        {state.phase === "final_wager" && <Countdown deadlineAt={state.deadlineAt} total={WAGER_MS} height={4} />}
      </div>
    );
  }

  if (state.phase === "final_answer" && clue) {
    if (locked) {
      if (state.mine.answer === undefined) return <Status>✓ Submitted</Status>;
      return (
        <Status sub="Look at the TV.">
          Submitted: <em>{state.mine.answer}</em>
        </Status>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Text ff={DISPLAY} fw={600} fz={28}>
          Type your answer.
        </Text>
        <FinalAnswerField
          key={clue.clueId}
          deadlineAt={state.deadlineAt}
          initial={state.mine.answer ?? ""}
          onDraft={(text) => send({ type: "answer_progress", clueId: clue.clueId, text })}
          onSubmit={(text) => send({ type: "submit_answer", clueId: clue.clueId, answer: text, source: "typed" })}
        />
        <Text size="xs" c={SOFT}>
          Submitting is final. When time runs out, whatever is here is sent. Small typos are fine.
        </Text>
      </div>
    );
  }
  return <Status>Look at the TV.</Status>;
}

function Status({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
      <Text ff={DISPLAY} fw={600} fz={32} lh={1.1} c="white">
        {children}
      </Text>
      {sub && (
        <Text size="sm" c={SOFT} maw={320}>
          {sub}
        </Text>
      )}
    </div>
  );
}
