import type { ApiComponents } from "@schmegettes/shared";
import { api } from "./api";

export type RoomJoin = ApiComponents["schemas"]["RoomJoin"];

/** Why a room request failed, from the problem type (shared/openapi.yaml). */
export type RoomProblem =
  | "room-not-found"
  | "room-full"
  | "game-started"
  | "invalid-name"
  | "not-a-host"
  | "rate-limited"
  | "not-in-game"
  | "not-the-host"
  | "not-resumable"
  | "error";

export type RoomResult = { ok: true; data: RoomJoin } | { ok: false; problem: RoomProblem };

const KNOWN: RoomProblem[] = [
  "room-not-found",
  "room-full",
  "game-started",
  "invalid-name",
  "not-a-host",
  "rate-limited",
  "not-in-game",
  "not-the-host",
  "not-resumable",
];

function problemOf(error: unknown): RoomProblem {
  const type = (error as { type?: string } | undefined)?.type ?? "";
  return KNOWN.find((p) => type.endsWith(`/problems/${p}`)) ?? "error";
}

async function settle(call: Promise<{ data?: RoomJoin; error?: unknown }>): Promise<RoomResult> {
  try {
    const { data, error } = await call;
    if (data) return { ok: true, data };
    return { ok: false, problem: problemOf(error) };
  } catch {
    return { ok: false, problem: "error" };
  }
}

export function createRoom(displayName: string): Promise<RoomResult> {
  return settle(api.POST("/v1/rooms", { body: { displayName } }));
}

export function joinRoom(code: string, displayName: string): Promise<RoomResult> {
  return settle(api.POST("/v1/rooms/join", { body: { code, displayName } }));
}

/** A room the caller already belongs to; room-not-found for everyone else. */
export function roomByCode(code: string): Promise<RoomResult> {
  return settle(api.GET("/v1/rooms/by-code/{code}", { params: { path: { code } } }));
}

export type CurrentRoom = ApiComponents["schemas"]["CurrentRoom"];

/** The room this account is in (a game first), for Home's Rejoin card; null when none. */
export async function currentRoom(): Promise<CurrentRoom | null> {
  try {
    const { data, response } = await api.GET("/v1/me/current-room");
    return response.status === 200 && data ? data : null;
  } catch {
    return null;
  }
}

/** Opens (or returns) the resume lobby for an abandoned game this account hosted. */
export function resumeGame(gameId: string): Promise<RoomResult> {
  return settle(api.POST("/v1/games/{gameId}/resume", { params: { path: { gameId } } }));
}
