import type { ApiComponents } from "@schmegettes/shared";
import { api } from "./api";
import { supabase } from "./supabase";

export type GameSummary = ApiComponents["schemas"]["GameSummary"];
export type GameDetail = ApiComponents["schemas"]["GameDetail"];

export type Loaded<T> = { ok: true; data: T } | { ok: false; notFound: boolean };

/** Only games played as a contestant, or only games watched. */
export type GameKind = "played" | "watched";

export type GameStats = { games: number; played: number; wins: number; best: number | null };

export type GamesPage = { items: GameSummary[]; nextCursor: string | null; stats: GameStats | null };

/** A page of the player's past games (20), newest first; the first page also has their stats. */
export async function listGames(cursor?: string, kind?: GameKind): Promise<Loaded<GamesPage>> {
  try {
    const query = { ...(cursor ? { cursor } : {}), ...(kind ? { kind } : {}) };
    const { data, response } = await api.GET("/v1/games", { params: { query } });
    return data
      ? { ok: true, data: { ...data, stats: data.stats ?? null } }
      : { ok: false, notFound: response.status === 404 };
  } catch {
    return { ok: false, notFound: false };
  }
}

/**
 * The player's most recent game, for Home. Null when there is none, it can't load, or this device
 * has no session yet: a first visit must not start one.
 */
export async function lastGame(): Promise<GameSummary | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
  } catch {
    return null;
  }
  const page = await listGames();
  return page.ok ? (page.data.items[0] ?? null) : null;
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
