import type { ClientMessage, Domain, Server, ServerMessage } from "@schmegettes/shared";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { GameSocket } from "./gameSocket";

export type Player = Server.Player;

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
}

export const initialRoom: RoomState = {
  connection: "connecting",
  phase: "lobby",
  hostUserId: "",
  hostDisplayName: "",
  hostPlays: false,
  maxPlayers: 0,
  players: [],
};

export type RoomEvent = ServerMessage | { type: "dropped" } | { type: "left" } | { type: "clear_error" };

/** Folds server messages into the lobby state. Pure, so it is tested directly. */
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
    case "phase_changed":
      return { ...state, phase: event.phase };
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
