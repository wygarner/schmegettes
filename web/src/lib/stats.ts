import type { ApiComponents } from "@schmegettes/shared";
import { api } from "./api";

export type MyStats = ApiComponents["schemas"]["MyStats"];
export type Leaderboard = ApiComponents["schemas"]["Leaderboard"];

export type StatsLoad<T> = { kind: "ok"; data: T } | { kind: "no-games" } | { kind: "error" };

export async function getMyStats(): Promise<StatsLoad<MyStats>> {
  try {
    const { data } = await api.GET("/v1/me/stats");
    return data ? { kind: "ok", data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export async function getLeaderboard(): Promise<StatsLoad<Leaderboard>> {
  try {
    const { data, response } = await api.GET("/v1/leaderboard");
    if (data) return { kind: "ok", data };
    return response.status === 403 ? { kind: "no-games" } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
