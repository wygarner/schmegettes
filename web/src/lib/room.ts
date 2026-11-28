import type { ClientMessage, Domain, Server, ServerMessage } from "@schmegettes/shared";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { CLOSE_OTHER_DEVICE, GameSocket } from "./gameSocket";

export type Player = Server.Player;
export type BoardClue = Server.BoardClue;
export type ResumeLobby = Server.ResumeLobby;

export interface Verdict {
  /** Set for answers the host may override. */
  answerId?: string;
  userId: string;
  answer: string;
  verdict: string;
  delta: number;
}

/** Whether a verdict counts as right (the judge's, or the host's override). */
export function isCorrect(verdict: string): boolean {
  return verdict === "correct" || verdict === "overridden_correct";
}

/** An answer after an earlier one on the clue was overridden to correct: it scores 0. */
export function isVoided(verdict: string): boolean {
  return verdict === "voided";
}

/** One Final Schmegettes reveal step, in reveal order. */
export interface Reveal extends Verdict {
  wager: number;
}

export interface Result {
  userId: string;
  displayName: string;
  score: number;
  placement: number;
}

export interface RoomState {
  /** connecting until the first snapshot; closed once the room closes or the player leaves */
  connection: "connecting" | "open" | "reconnecting" | "closed";
  phase: Domain.GamePhase;
  hostUserId: string;
  hostDisplayName: string;
  hostPlays: boolean;
  maxPlayers: number;
  /** In join order. The host is listed only while they play. */
  players: Player[];
  error?: { code: string; message?: string };

  // Gameplay (docs/product-docs/features/gameplay/)
  round: Domain.Round;
  /** The current round's clues, column by column. Phones never get clue text. */
  board: BoardClue[];
  activeClue?: BoardClue;
  /**
   * The pick reveal to play, set only by the pick's phase_changed (never by a re-read or a
   * snapshot): "card" for a clue (blink, then the category card), "blink" for a Daily Double.
   */
  reveal?: { clueId: string; kind: "card" | "blink" };
  /** Server clock, ms, when the current step times out. */
  deadlineAt?: number;
  /** This game's buzz window and answer time (its timer pace); absent: Standard. */
  buzzWindowMs?: number;
  answerWindowMs?: number;
  /** This game's Quick picks option (room_snapshot); false before a game starts. */
  quickPicks: boolean;
  controllingUserId?: string;
  answeringUserId?: string;
  /** The answering player's stage: begin (time to start speaking) or finish. */
  answerStage?: Server.AnswerStage;
  attemptedUserIds: string[];
  paused: boolean;
  /** Why the game is paused: the host device left, or it has no sound. */
  pauseReason?: Server.PauseReason;
  scores: Record<string, number>;
  /** user -> server ms until which their buzzer is locked out */
  lockouts: Record<string, number>;
  /** The answering player's words so far. */
  liveText?: string;
  lastVerdict?: Verdict;
  /** Set after a clue ends; the TV gets the correct response, phones don't. */
  clueEnd?: { state: "answered" | "unanswered"; correctResponse?: string };
  /** Between round_started and the round's first board phase ("Double Schmegettes!"). */
  roundIntro?: Domain.Round;
  results?: Result[];

  // Wagers (docs/product-docs/features/wagers/)
  /** Daily Double: the picker's range and, once locked, their (public) wager. */
  wagerMin?: number;
  wagerMax?: number;
  wager?: number;
  /** Final: who plays, who has locked in (wager, then answer), and the reveal order. */
  finalistUserIds: string[];
  lockedUserIds: string[];
  revealOrder: string[];
  /** This player's own Final wager and answer. The server sends them only to their owner,
   * never to the host device. */
  mine: { wager?: number; answer?: string; submitted?: boolean };
  /** Final reveal steps so far. */
  reveals: Reveal[];
  finalSkipped?: boolean;

  // Overrides, the scoreboard and Rematch (docs/product-docs/features/scoreboard-and-overrides/)
  /** The judged answers of the clue just played (or the finalist on the reveal stage), in
   * order. The host device overrides from these. */
  answers: Verdict[];
  /** The host is reviewing a verdict: the clock is paused. userIds are the answerers. */
  review?: { open: boolean; userIds: string[] };
  /** Answer ids the host has overridden in this clue (labeled HOST OVERRIDE). */
  overridden: string[];
  /** The last override, for the overridden player's phone. */
  lastOverride?: Verdict;
  /** Server ms: when the game started and ended (the scoreboard's date and length). */
  startedAt?: number;
  finishedAt?: number;
  /** Back in the lobby after a finished game. */
  rematch?: boolean;
  /** This player opened the game on another device; this page stopped. */
  replaced?: boolean;
  /** A resume lobby: the game being resumed and its contestants (rejoin-games). */
  resume?: ResumeLobby;
}

export const initialRoom: RoomState = {
  connection: "connecting",
  phase: "lobby",
  hostUserId: "",
  hostDisplayName: "",
  hostPlays: false,
  maxPlayers: 0,
  players: [],
  round: "single",
  board: [],
  attemptedUserIds: [],
  paused: false,
  quickPicks: false,
  scores: {},
  lockouts: {},
  finalistUserIds: [],
  lockedUserIds: [],
  revealOrder: [],
  mine: {},
  reveals: [],
  answers: [],
  overridden: [],
};

/** Final results from the scores: highest first; ties share a placement (1, 1, 3). */
export function resultsFrom(players: Player[], scores: Record<string, number>): Result[] {
  const ranked = players
    .filter((p) => p.role === "contestant" || p.role === "host")
    .map((p) => ({ userId: p.userId, displayName: p.displayName, score: scores[p.userId] ?? p.score }))
    .sort((a, b) => b.score - a.score);
  return ranked.map((r) => ({ ...r, placement: 1 + ranked.filter((o) => o.score > r.score).length }));
}

/** Clears what belongs to one clue. */
function clueReset(): Partial<RoomState> {
  return {
    liveText: undefined,
    lastVerdict: undefined,
    clueEnd: undefined,
    answers: [],
    overridden: [],
    review: undefined,
    lastOverride: undefined,
  };
}

/** The phases of Final Schmegettes. */
export function inFinal(phase: Domain.GamePhase): boolean {
  return phase.startsWith("final_");
}

type WagerFields = Pick<
  Server.PhaseChanged,
  "wagerMin" | "wagerMax" | "wager" | "finalistUserIds" | "lockedUserIds" | "revealOrder"
>;

function wagerFields(m: WagerFields) {
  return {
    wagerMin: m.wagerMin,
    wagerMax: m.wagerMax,
    wager: m.wager,
    finalistUserIds: m.finalistUserIds ?? [],
    lockedUserIds: m.lockedUserIds ?? [],
    revealOrder: m.revealOrder ?? [],
  };
}

function addOnce(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

export type RoomEvent =
  | ServerMessage
  | { type: "dropped" }
  | { type: "left" }
  | { type: "clear_error" }
  | { type: "replaced" };

function withClue(board: BoardClue[], clue: BoardClue | undefined): BoardClue[] {
  if (!clue) return board;
  return board.map((c) => (c.clueId === clue.clueId ? { ...c, state: clue.state } : c));
}

/** Folds server messages into the room state. Pure, so it is tested directly. */
export function reduceRoom(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case "room_snapshot": {
      // A snapshot is the whole truth: nothing from a previous game or clue survives it.
      const finished = event.phase === "finished";
      // No scores means no game (the lobby, or a rematch): everyone is at $0. Keeping the
      // previous scores left last game's totals on screen until the next Start.
      const scores = event.scores ?? {};
      return {
        ...state,
        ...clueReset(),
        buzzWindowMs: event.buzzWindowMs,
        answerWindowMs: event.answerWindowMs,
        quickPicks: event.quickPicks ?? false,
        results: finished ? (state.results ?? resultsFrom(event.players, scores)) : undefined,
        finalSkipped: finished ? state.finalSkipped : undefined,
        reveals: finished || event.phase === "final_reveal" ? state.reveals : [],
        lockouts: {},
        rematch: event.phase === "lobby" && (state.phase === "finished" || state.rematch === true),
        answers: (event.clueAnswers ?? []).map((a) => ({
          answerId: a.answerId,
          userId: a.userId,
          answer: a.answer,
          verdict: a.verdict,
          delta: a.scoreDelta,
        })),
        review: event.overrideReview ? { open: true, userIds: [] } : undefined,
        connection: "open",
        phase: event.phase,
        players: event.players,
        hostDisplayName: event.hostDisplayName ?? state.hostDisplayName,
        hostPlays: event.hostPlays ?? state.hostPlays,
        resume: event.resume,
        maxPlayers: event.maxPlayers ?? state.maxPlayers,
        round: event.round,
        board: event.board,
        activeClue: event.activeClue,
        deadlineAt: event.deadlineAt,
        controllingUserId: event.controllingUserId,
        answeringUserId: event.answeringUserId,
        answerStage: event.answerStage,
        attemptedUserIds: event.attemptedUserIds ?? [],
        paused: event.paused ?? false,
        pauseReason: event.paused ? event.pauseReason : undefined,
        liveText: undefined,
        roundIntro: undefined,
        ...wagerFields(event),
        mine: {
          wager: event.myWager,
          answer: event.myFinalAnswer,
          submitted: event.myFinalSubmitted,
        },
        scores,
      };
    }
    case "lobby_updated":
      return {
        ...state,
        hostUserId: event.hostUserId,
        hostDisplayName: event.hostDisplayName,
        hostPlays: event.hostPlays,
        maxPlayers: event.maxPlayers,
        players: event.players,
        resume: event.resume,
      };
    case "phase_changed": {
      const next: RoomState = {
        ...state,
        phase: event.phase,
        deadlineAt: event.deadlineAt,
        answeringUserId: event.answeringUserId,
        answerStage: event.answerStage,
        // phase_changed carries the whole list; the server's encoder drops it when empty.
        attemptedUserIds: event.attemptedUserIds ?? [],
        controllingUserId: event.controllingUserId ?? state.controllingUserId,
        paused: event.paused ?? state.paused,
        pauseReason: (event.paused ?? state.paused) ? state.pauseReason : undefined,
        activeClue: event.activeClue,
        board: withClue(state.board, event.activeClue),
        reveal:
          event.revealUntil !== undefined && event.activeClue
            ? { clueId: event.activeClue.clueId, kind: event.phase === "daily_double_wager" ? "blink" : "card" }
            : undefined,
        ...wagerFields(event),
      };
      if (event.phase === "daily_double_wager" && state.phase !== "daily_double_wager") {
        Object.assign(next, clueReset());
      }
      if (event.phase === "final_category" && state.phase !== "final_category") {
        Object.assign(next, clueReset());
        next.roundIntro = undefined;
        next.round = "final";
      }
      if (event.phase === "final_reveal" && state.phase !== "final_reveal") next.reveals = [];
      if (event.phase === "clue_reading" && state.phase !== "clue_reading") {
        // A new clue (a resumed re-read of the same clue keeps who already answered).
        const sameClue = state.activeClue?.clueId === event.activeClue?.clueId && state.answers.length > 0;
        Object.assign(
          next,
          sameClue ? { liveText: undefined, lastVerdict: undefined, clueEnd: undefined } : clueReset(),
        );
        next.lockouts = {};
      }
      if (event.phase === "buzzing_open") next.liveText = undefined;
      if (event.phase === "board") {
        Object.assign(next, clueReset());
        next.activeClue = undefined;
        next.roundIntro = undefined;
      }
      if (event.phase === "lobby") next.rematch = state.phase === "finished";
      return next;
    }
    case "buzz_result":
      if (event.outcome === "locked_out" && event.lockoutUntil) {
        return { ...state, lockouts: { ...state.lockouts, [event.userId]: event.lockoutUntil } };
      }
      return state;
    case "answer_progress":
      return { ...state, liveText: event.text };
    case "answer_judged": {
      const verdict: Verdict = {
        answerId: event.answerId,
        userId: event.userId,
        answer: event.answer,
        verdict: event.verdict,
        delta: event.scoreDelta,
      };
      if (state.phase === "final_reveal") {
        return {
          ...state,
          scores: event.scores,
          reveals: [...state.reveals, { ...verdict, wager: event.wager ?? 0 }],
          // Only the finalist on the stage can be overridden.
          answers: [verdict],
          overridden: [],
          review: undefined,
          lastOverride: undefined,
        };
      }
      return {
        ...state,
        scores: event.scores,
        liveText: undefined,
        lastVerdict: verdict,
        answers: [...state.answers, verdict],
      };
    }
    case "verdict_overridden": {
      // The overridden answer, plus any later answers on the clue it voided or restored.
      const others = new Map((event.voided ?? []).map((v) => [v.answerId, v]));
      const fix = <T extends Verdict>(v: T): T => {
        if (v.answerId === event.answerId) return { ...v, verdict: event.verdict, delta: event.scoreDelta };
        const o = v.answerId ? others.get(v.answerId) : undefined;
        return o ? { ...v, verdict: o.verdict, delta: o.scoreDelta } : v;
      };
      const changed = state.answers.find((a) => a.answerId === event.answerId);
      return {
        ...state,
        scores: event.scores,
        controllingUserId: event.controllingUserId ?? state.controllingUserId,
        deadlineAt: event.deadlineAt ?? state.deadlineAt,
        answers: state.answers.map(fix),
        reveals: state.reveals.map(fix),
        lastVerdict: state.lastVerdict ? fix(state.lastVerdict) : undefined,
        overridden: addOnce(state.overridden, event.answerId),
        lastOverride: {
          answerId: event.answerId,
          userId: event.userId,
          answer: changed?.answer ?? "",
          verdict: event.verdict,
          delta: event.scoreDelta,
        },
      };
    }
    case "override_review_changed":
      return {
        ...state,
        review: { open: event.open, userIds: event.userIds },
        deadlineAt: event.open ? undefined : event.deadlineAt,
      };
    case "wager_locked": {
      // A Daily Double wager is public. In Final only the owner's copy carries the amount.
      if (state.phase === "daily_double_wager") return { ...state, wager: event.amount ?? state.wager };
      const next = { ...state, lockedUserIds: addOnce(state.lockedUserIds, event.userId) };
      if (event.amount !== undefined) next.mine = { ...state.mine, wager: event.amount };
      return next;
    }
    case "final_submitted": {
      const next = { ...state, lockedUserIds: addOnce(state.lockedUserIds, event.userId) };
      if (event.answer !== undefined) next.mine = { ...state.mine, answer: event.answer, submitted: true };
      return next;
    }
    case "clue_ended":
      return {
        ...state,
        scores: event.scores,
        controllingUserId: event.controllingUserId ?? state.controllingUserId,
        answeringUserId: undefined,
        deadlineAt: undefined,
        clueEnd: { state: event.state, correctResponse: event.correctResponse },
        board: state.board.map((c) => (c.clueId === event.clueId ? { ...c, state: event.state } : c)),
      };
    case "round_started":
      return {
        ...state,
        round: event.round,
        board: event.board,
        controllingUserId: event.controllingUserId ?? state.controllingUserId,
        activeClue: undefined,
        clueEnd: undefined,
        lastVerdict: undefined,
        roundIntro: event.round,
      };
    case "game_over":
      return {
        ...state,
        results: event.results,
        deadlineAt: undefined,
        activeClue: undefined,
        finalSkipped: event.finalSkipped ?? false,
        startedAt: event.startedAt,
        finishedAt: event.finishedAt,
        ...clueReset(),
      };
    case "game_paused":
      return {
        ...state,
        paused: event.paused,
        pauseReason: event.paused ? event.reason : undefined,
        deadlineAt: event.paused ? undefined : state.deadlineAt,
      };
    case "room_closed":
    case "left":
      return { ...state, connection: "closed" };
    case "replaced":
      return { ...state, connection: "closed", replaced: true };
    case "dropped":
      return state.connection === "closed" ? state : { ...state, connection: "reconnecting" };
    case "error":
      return { ...state, error: { code: event.code, message: event.message } };
    case "clear_error":
      return { ...state, error: undefined };
    default:
      return state;
  }
}

/** A player's display name, or "" when unknown. */
export function nameOf(state: RoomState, userId: string | undefined): string {
  if (!userId) return "";
  if (userId === state.hostUserId && !state.hostPlays) return state.hostDisplayName;
  return state.players.find((p) => p.userId === userId)?.displayName ?? "";
}

/** Contestants count toward Start and the limit; a playing host is one of them. */
export function contestantCount(state: RoomState): number {
  return state.players.filter((p) => p.role === "contestant" || p.role === "host").length;
}

/**
 * Connects to a room's socket and keeps the lobby state. Reconnects with backoff when the
 * server drops the connection, until the room closes or the player leaves.
 */
export function useRoom(socketUrl: string | null, hostUserId = "") {
  const [state, dispatch] = useReducer(reduceRoom, { ...initialRoom, hostUserId });
  const socketRef = useRef<GameSocket | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!socketUrl) return;
    stoppedRef.current = false;
    const socket = new GameSocket(socketUrl);
    socketRef.current = socket;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = socket.subscribe((message) => {
      if (message.type === "room_snapshot") attempt = 0;
      if (message.type === "room_closed") stoppedRef.current = true;
      dispatch(message);
    });
    const unDrop = socket.onDrop((code) => {
      if (stoppedRef.current) return;
      if (code === CLOSE_OTHER_DEVICE) {
        stoppedRef.current = true;
        dispatch({ type: "replaced" });
        return;
      }
      dispatch({ type: "dropped" });
      const delay = Math.min(500 * 2 ** attempt, 5000);
      attempt += 1;
      timer = setTimeout(() => void socket.connect().catch(() => undefined), delay);
    });
    void socket.connect().catch(() => dispatch({ type: "dropped" }));

    return () => {
      stoppedRef.current = true;
      clearTimeout(timer);
      unsubscribe();
      unDrop();
      socket.close();
      socketRef.current = null;
    };
  }, [socketUrl]);

  const send = useCallback((message: ClientMessage) => {
    dispatch({ type: "clear_error" });
    socketRef.current?.send(message);
  }, []);

  const leave = useCallback(() => {
    stoppedRef.current = true;
    socketRef.current?.send({ type: "leave_room" });
    dispatch({ type: "left" });
  }, []);

  return { state, send, leave };
}
