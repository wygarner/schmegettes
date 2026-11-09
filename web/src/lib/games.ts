import type { ApiComponents } from "@schmegettes/shared";
import { api } from "./api";

export type GameSummary = ApiComponents["schemas"]["GameSummary"];
export type GameDetail = ApiComponents["schemas"]["GameDetail"];

export type Loaded<T> = { ok: true; data: T } | { ok: false; notFound: boolean };

/** A page of the player's past games (20), newest first. */
export async function listGames(cursor?: string): Promise<Loaded<{ items: GameSummary[]; nextCursor: string | null }>> {
  try {
    const { data, response } = await api.GET("/v1/games", { params: { query: cursor ? { cursor } : {} } });
    return data ? { ok: true, data } : { ok: false, notFound: response.status === 404 };
  } catch {
    return { ok: false, notFound: false };
  }
}

/** One game's scoreboard; notFound when the player didn't play or watch it. */
export async function gameDetail(gameId: string): Promise<Loaded<GameDetail>> {
  try {
    const { data, response } = await api.GET("/v1/games/{gameId}", { params: { path: { gameId } } });
    return data ? { ok: true, data } : { ok: false, notFound: response.status === 404 };
  } catch {
    return { ok: false, notFound: false };
  }
}
