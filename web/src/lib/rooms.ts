import type { ApiComponents } from "@schmegettes/shared";
import { api } from "./api";

export type RoomJoin = ApiComponents["schemas"]["RoomJoin"];

/** Why a room request failed, from the problem type (shared/openapi.yaml). */
export type RoomProblem = "room-not-found" | "room-full" | "game-started" | "invalid-name" | "error";

export type RoomResult = { ok: true; data: RoomJoin } | { ok: false; problem: RoomProblem };

const KNOWN: RoomProblem[] = ["room-not-found", "room-full", "game-started", "invalid-name"];

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
