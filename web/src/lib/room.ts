import type { ClientMessage, Domain, Server, ServerMessage } from "@schmegettes/shared";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { GameSocket } from "./gameSocket";

export type Player = Server.Player;
export type BoardClue = Server.BoardClue;

export interface Verdict {
  userId: string;
  answer: string;
  verdict: string;
  delta: number;
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
  /** Server clock, ms, when the current step times out. */
  deadlineAt?: number;
  controllingUserId?: string;
  answeringUserId?: string;
  attemptedUserIds: string[];
  paused: boolean;
  scores: Record<string, number>;
  /** user -> server ms until which their buzzer is locked out */
  lockouts: Record<string, number>;
  /** The answering player's words so far. */
  liveText?: string;
  lastVerdict?: Verdict;
  /** Set after a clue ends; the TV gets the correct response, phones don't. */
  clueEnd?: { state: "answered" | "unanswered"; correctResponse?: string };
  /** Between round_started and the round's first board phase ("Double Jeopardy!"). */
  roundIntro?: Domain.Round;
  results?: Result[];
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
  scores: {},
  lockouts: {},
};

export type RoomEvent = ServerMessage | { type: "dropped" } | { type: "left" } | { type: "clear_error" };

function withClue(board: BoardClue[], clue: BoardClue | undefined): BoardClue[] {
  if (!clue) return board;
  return board.map((c) => (c.clueId === clue.clueId ? { ...c, state: clue.state } : c));
}

/** Folds server messages into the room state. Pure, so it is tested directly. */
export function reduceRoom(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case "room_snapshot":
      return {
        ...state,
        connection: "open",
        phase: event.phase,
        players: event.players,
        hostDisplayName: event.hostDisplayName ?? state.hostDisplayName,
        hostPlays: event.hostPlays ?? state.hostPlays,
        maxPlayers: event.maxPlayers ?? state.maxPlayers,
        round: event.round,
        board: event.board,
        activeClue: event.activeClue,
        deadlineAt: event.deadlineAt,
        controllingUserId: event.controllingUserId,
        answeringUserId: event.answeringUserId,
        attemptedUserIds: event.attemptedUserIds ?? [],
        paused: event.paused ?? false,
        scores: event.scores ?? state.scores,
        liveText: undefined,
        roundIntro: undefined,
      };
    case "lobby_updated":
      return {
        ...state,
        hostUserId: event.hostUserId,
        hostDisplayName: event.hostDisplayName,
        hostPlays: event.hostPlays,
        maxPlayers: event.maxPlayers,
        players: event.players,
      };
    case "phase_changed": {
      const next: RoomState = {
        ...state,
        phase: event.phase,
        deadlineAt: event.deadlineAt,
        answeringUserId: event.answeringUserId,
        // phase_changed carries the whole list; the server's encoder drops it when empty.
        attemptedUserIds: event.attemptedUserIds ?? [],
        controllingUserId: event.controllingUserId ?? state.controllingUserId,
        paused: event.paused ?? state.paused,
        activeClue: event.activeClue,
        board: withClue(state.board, event.activeClue),
      };
      if (event.phase === "clue_reading") {
        next.liveText = undefined;
        next.lastVerdict = undefined;
        next.clueEnd = undefined;
        next.lockouts = {};
      }
      if (event.phase === "buzzing_open") next.liveText = undefined;
      if (event.phase === "board") {
        next.activeClue = undefined;
        next.clueEnd = undefined;
        next.lastVerdict = undefined;
        next.roundIntro = undefined;
      }
      return next;
    }
    case "buzz_result":
      if (event.outcome === "locked_out" && event.lockoutUntil) {
        return { ...state, lockouts: { ...state.lockouts, [event.userId]: event.lockoutUntil } };
      }
      return state;
    case "answer_progress":
      return { ...state, liveText: event.text };
    case "answer_judged":
      return {
        ...state,
        scores: event.scores,
        liveText: undefined,
        lastVerdict: { userId: event.userId, answer: event.answer, verdict: event.verdict, delta: event.scoreDelta },
      };
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
      return { ...state, results: event.results, deadlineAt: undefined, activeClue: undefined };
    case "game_paused":
      return { ...state, paused: event.paused, deadlineAt: event.paused ? undefined : state.deadlineAt };
    case "room_closed":
    case "left":
      return { ...state, connection: "closed" };
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
    const unDrop = socket.onDrop(() => {
      if (stoppedRef.current) return;
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
