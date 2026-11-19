import { Box, Loader, Text, Title } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { money } from "../lib/money";
import { narrate, stopNarration } from "../lib/narrator";
import { narratorChoice } from "../lib/narratorVoice";
import { prepareVoice } from "../lib/piper/engine";
import { inFinal, isCorrect, nameOf, type RoomState } from "../lib/room";
import { playCorrect, playDailyDouble, playDoubleRound, playTimesUp, stopEffects } from "../lib/sfx";
import {
  correctResponseAnnouncement,
  DAILY_DOUBLE_INTRO,
  dailyDoubleAnnouncement,
  finalAnnouncement,
} from "../lib/speech";
import { GoldButton } from "../ui/GoldButton";
import { Meter } from "../ui/Meter";
import { BigMoment, Stage, StageBody, StageHeader } from "../ui/Stage";
import { ACCENT, DISPLAY, INK, SOFT } from "../ui/tokens";
import { BlindKeypad } from "./BlindKeypad";
import { Board } from "./Board";
import { ClueText } from "./ClueText";
import { Countdown } from "./Countdown";
import { DailyDoubleStage } from "./DailyDoubleStage";
import { FinalStage } from "./FinalStage";
import { HostLayout } from "./HostLayout";
import { useOverride, VerdictRow } from "./OverrideSheet";
import { usePickConfirm } from "./PickConfirm";
import { PickRevealStage, usePickReveal } from "./PickReveal";
import { PlayerColumn } from "./PlayerColumn";
import { PlayerControls } from "./PlayerControls";
import { Scoreboard } from "./Scoreboard";
import { buzzWindowMs, FINAL_SKIPPED_MS } from "./timing";
import { useSince } from "./useSince";
import { WagerPad } from "./WagerPad";

/**
 * Something the TV says. reportDone: tell the server when it ends (reading_done). sound: an
 * effect that plays first; the line waits for it (sound-effects feature brief).
 */
interface Speech {
  key: string;
  text: string;
  clueId: string;
  reportDone: boolean;
  sound?: () => Promise<void>;
}

/**
 * What the TV should be saying in this phase, if anything. Nothing during the pick reveal:
 * the narrator starts the clue when the reveal ends (it has been preparing it meanwhile).
 */
function currentSpeech(state: RoomState, revealing: boolean): Speech | null {
  const clue = state.activeClue;
  if (!clue) return null;
  // The correct-response screen (after a clue, or after Final): read the response once, then
  // tell the server, which returns to the board a second later (or at its cap regardless).
  const response = state.clueEnd?.correctResponse;
  if (response) {
    const right = state.clueEnd?.state === "answered" || state.answers.some((a) => isCorrect(a.verdict));
    const outcome = inFinal(state.phase) ? "final" : right ? "right" : "missed";
    return {
      key: `response:${clue.clueId}`,
      text: correctResponseAnnouncement(response, outcome),
      clueId: clue.clueId,
      reportDone: !inFinal(state.phase),
      // A chime when someone got it, a time's-up tone when nobody did; Final is neutral.
      sound: outcome === "right" ? playCorrect : outcome === "missed" ? playTimesUp : undefined,
    };
  }
  if (revealing) return null;
  switch (state.phase) {
    case "clue_reading": {
      if (!clue.clueText) return null;
      // Only the clue: the reveal showed the category and value. A Daily Double says its wager.
      const text =
        clue.dailyDouble && state.wager !== undefined
          ? `${dailyDoubleAnnouncement(state.wager)} ${clue.clueText}`
          : clue.clueText;
      // A resume re-reads with a new deadline.
      return {
        key: `read:${clue.clueId}:${state.deadlineAt}`,
        text,
        clueId: clue.clueId,
        reportDone: true,
      };
    }
    case "daily_double_wager":
      if (state.wager !== undefined) return null;
      return {
        key: `dd:${clue.clueId}`,
        text: DAILY_DOUBLE_INTRO,
        clueId: clue.clueId,
        reportDone: false,
        sound: playDailyDouble,
      };
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
 * score in the player column. Shows each pick (the pick reveal), then reads the clue. The board
 * is tappable only when the host plays and has control.
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

  // After a reload mid-game, the chosen voice loads from the device in the background; lines
  // before it's ready are skipped.
  useEffect(() => {
    void prepareVoice(narratorChoice().id);
  }, []);

  // Say each announcement and clue once per showing. Only a reading that really ended
  // reports reading_done; a skipped or blocked line leaves it to the server's timer, so
  // nobody can buzz (or the Final can't start) before the room could have heard it.
  const say = useCallback(
    (speech: Speech) => {
      const read = () =>
        void narrate(speech.text).then((result) => {
          if (result === "failed") setSoundBlocked(true);
          if (result === "ended") {
            setSoundBlocked(false);
            if (speech.reportDone && spokenRef.current === speech.key)
              send({ type: "reading_done", clueId: speech.clueId });
          }
        });
      // The line waits for its sound, unless the screen moved on meanwhile.
      if (speech.sound)
        void speech.sound().then(() => {
          if (spokenRef.current === speech.key) read();
        });
      else read();
    },
    [send],
  );
  const revealStage = usePickReveal(state.reveal);
  const speech = currentSpeech(state, revealStage !== null);
  const speechKey = speech?.key ?? "";
  // speech is rebuilt every render; its key says when it changed.
  const speechRef = useRef(speech);
  speechRef.current = speech;

  useEffect(() => {
    if (state.paused) {
      spokenRef.current = ""; // the server reads again on resume
      stopEffects();
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
    else void narrate("Sound on");
  };

  useEffect(() => {
    if (!speechKey) stopNarration();
  }, [speechKey]);

  // "Double Schmegettes!" gets its fanfare, once per round, inside the 3 s interstitial.
  const doubleIntro = state.roundIntro === "double" && state.phase !== "clue_reading" && !state.paused;
  const fanfareRef = useRef(false);
  useEffect(() => {
    if (!doubleIntro) {
      fanfareRef.current = false;
      return;
    }
    if (fanfareRef.current) return;
    fanfareRef.current = true;
    void playDoubleRound();
  }, [doubleIntro]);

  const skipSince = useSince(state.finalSkipped ? "skipped" : "", FINAL_SKIPPED_MS);

  const hostPicks = state.hostPlays && state.controllingUserId === hostUserId;
  const hostInputs = useHostInputs(state, hostUserId, send);
  const override = useOverride(state, send);
  // The host may override a verdict on the correct-response screen, or on the reveal step.
  const onOverride = !state.paused && (state.clueEnd || state.phase === "final_reveal") ? override.ask : undefined;

  let main: ReactNode;
  if (state.results && state.finalSkipped && skipSince < FINAL_SKIPPED_MS) {
    main = (
      <Stage>
        <StageBody>
          <Title order={2} ff={DISPLAY} c="white" ta="center" style={{ fontSize: "min(10cqh, 6cqw)" }}>
            Nobody's in the black: no Final Schmegettes.
          </Title>
        </StageBody>
      </Stage>
    );
  } else if (state.results) {
    main = <Scoreboard state={state} onRematch={() => send({ type: "rematch" })} />;
  } else if (revealStage && clue) {
    main = <PickRevealStage board={state.board} clue={clue} stage={revealStage} />;
  } else if (state.phase === "daily_double_wager") {
    main = <DailyDoubleStage state={state} hostWager={hostInputs.ddWager} />;
  } else if (inFinal(state.phase)) {
    main = <FinalStage state={state} hostInput={hostInputs.final} onOverride={onOverride} />;
  } else if (state.roundIntro && state.phase !== "clue_reading") {
    main = (
      <Stage>
        <StageBody gap="0">
          <BigMoment>Double</BigMoment>
          <BigMoment>Schmegettes!</BigMoment>
          <span style={VISUALLY_HIDDEN}>Double Schmegettes!</span>
        </StageBody>
      </Stage>
    );
  } else if (clue && state.phase !== "board") {
    main = <ClueView state={state} speaking={Boolean(speech) && !state.paused} onOverride={onOverride} />;
  } else {
    main = <Board board={state.board} onPick={hostPicks ? confirm.ask : undefined} />;
  }

  const stage = (
    <>
      {soundBlocked && (
        <GoldButton mb={8} onClick={unblockSound}>
          Tap to turn on sound
        </GoldButton>
      )}
      <Box style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {main}
        {state.paused && (
          <div
            role="status"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 12,
              background: "rgba(20,11,43,.85)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: "#fff",
            }}
          >
            <Loader color="green.4" size="sm" />
            <Text ff={DISPLAY} fz={28} fw={600}>
              Paused
            </Text>
            <Text size="sm" c={SOFT}>
              Waiting for the TV to reconnect…
            </Text>
          </div>
        )}
      </Box>
      {confirm.modal}
      {override.sheet}
    </>
  );

  const column = (
    <>
      <Box style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <PlayerColumn state={state} />
      </Box>
      {state.hostPlays && !state.results && (
        <PlayerControls state={state} userId={hostUserId} send={send} compact spaceToBuzz buzzerHeight={64} />
      )}
    </>
  );

  return <HostLayout stage={stage} column={column} />;
}

/**
 * The host's own wager and Final answer go on the stage: the player column has no room for a
 * number pad. The Final wager is masked, and the Final answer uses the blind keypad, because
 * the host device is on the TV.
 */
function useHostInputs(state: RoomState, hostUserId: string, send: (m: ClientMessage) => void) {
  const clue = state.activeClue;
  const playing = state.hostPlays && !state.paused;
  let ddWager: ((amount: number) => void) | undefined;
  if (playing && state.controllingUserId === hostUserId && state.wager === undefined) {
    ddWager = (amount) => send({ type: "submit_wager", amount });
  }
  let final: ReactNode;
  const finalist = playing && state.finalistUserIds.includes(hostUserId) && !state.lockedUserIds.includes(hostUserId);
  if (finalist && (state.phase === "final_category" || state.phase === "final_wager")) {
    final = (
      <WagerPad
        layout="stage"
        masked
        min={0}
        max={Math.max(0, state.scores[hostUserId] ?? 0)}
        confirmLabel="Lock in"
        onWager={(amount) => send({ type: "submit_wager", amount })}
      />
    );
  } else if (finalist && state.phase === "final_answer" && clue) {
    final = (
      <BlindKeypad
        key={clue.clueId}
        onDraft={(text) => send({ type: "answer_progress", clueId: clue.clueId, text })}
        onSubmit={(text) => send({ type: "submit_answer", clueId: clue.clueId, answer: text, source: "typed" })}
      />
    );
  }
  return { ddWager, final };
}

function ClueView({
  state,
  speaking,
  onOverride,
}: {
  state: RoomState;
  speaking: boolean;
  onOverride?: (answerId: string) => void;
}) {
  const clue = state.activeClue;
  if (!clue) return null;
  const ended = state.clueEnd;
  const open = state.phase === "buzzing_open" && !ended;
  // Just judged: the verdict replaces the transcript until buzzing reopens or the clue ends.
  const judged = state.phase === "answering" && !ended && state.lastVerdict?.userId === state.answeringUserId;
  const answering = state.phase === "answering" && !ended && !judged;
  return (
    <Stage lit={open}>
      <StageHeader right={speaking && <Meter height={12} color={SOFT} />}>
        {clue.category} ·{" "}
        {clue.dailyDouble && state.wager !== undefined ? `DD ${money(state.wager)}` : money(clue.value)}
      </StageHeader>
      <StageBody gap="2cqh">
        {/* The correct-response screen leaves the clue out. */}
        {!ended && <ClueText text={clue.clueText ?? ""} />}
        {ended &&
          (state.answers.length ? state.answers : state.lastVerdict ? [state.lastVerdict] : []).map((v, i) => (
            <VerdictRow key={v.answerId ?? i} state={state} verdict={v} onOverride={onOverride} />
          ))}
        {judged && state.lastVerdict && <VerdictRow state={state} verdict={state.lastVerdict} />}
        {ended?.correctResponse && (
          <div>
            <div
              style={{
                color: SOFT,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".14em",
                fontSize: "clamp(10px, 4.5cqh, 18px)",
              }}
            >
              Correct response
            </div>
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                color: "#fff",
                textTransform: "uppercase",
                lineHeight: 1.05,
                fontSize: "min(15cqh, 9cqw)",
                textShadow: "0 3px 0 rgba(0,0,0,.4)",
              }}
            >
              {ended.correctResponse}
            </div>
          </div>
        )}
      </StageBody>
      {answering && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "12cqh", flexShrink: 0 }}>
          <span
            style={{
              background: ACCENT,
              color: INK,
              fontWeight: 800,
              fontSize: "clamp(10px, 4.4cqh, 18px)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {nameOf(state, state.answeringUserId)}
          </span>
          <Meter height={18} />
          <span
            style={{
              fontStyle: "italic",
              fontSize: "clamp(12px, 6cqh, 26px)",
              color: "#fff",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {state.liveText ? `“${state.liveText}”` : <span style={{ color: "#9a7aad" }}>listening…</span>}
          </span>
        </div>
      )}
      {!ended && !answering && !judged && state.lastVerdict && (
        <VerdictRow state={state} verdict={state.lastVerdict} small />
      )}
      {open && <Countdown deadlineAt={state.deadlineAt} total={buzzWindowMs(state)} />}
    </Stage>
  );
}

const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;
