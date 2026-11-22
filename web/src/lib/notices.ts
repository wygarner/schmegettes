import type { ApiComponents } from "@schmegettes/shared";
import { api } from "./api";

export { lobbyTitle, noticeTitle, showFullGameLine } from "./noticeFormat";

export type Notice = ApiComponents["schemas"]["Notice"];
export type NoticeResponse = { notices: Notice[]; serverTime: string };

const DISMISSED_KEY = "schmegettes.dismissedNotices";

export async function fetchNotices(): Promise<NoticeResponse> {
  const signal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8_000) : undefined;
  const result = await api.GET("/v1/notices", { signal });
  if (result.response.status >= 500) throw new Error("server unavailable");
  if (!result.data) return { notices: [], serverTime: new Date().toISOString() };
  return result.data;
}

function dismissed(): Set<string> {
  try {
    const values: unknown = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

export function dismissalKey(notice: Pick<Notice, "id" | "revision">): string {
  return `${notice.id}:${notice.revision}`;
}

export function isDismissed(notice: Pick<Notice, "id" | "revision">): boolean {
  return dismissed().has(dismissalKey(notice));
}

export function dismissNotice(notice: Pick<Notice, "id" | "revision">): void {
  try {
    const values = dismissed();
    values.add(dismissalKey(notice));
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...values]));
  } catch {
    // Storage can be unavailable in private browsing; dismissal remains best-effort.
  }
}

export function visibleNotices(notices: Notice[]): Notice[] {
  return notices.filter((notice) => !isDismissed(notice));
}

export function lobbyNotices(notices: Notice[], serverTime: string): Notice[] {
  const now = new Date(serverTime).getTime();
  return notices.filter((notice) => {
    if (notice.kind === "incident") return notice.phase === "active";
    if (notice.kind !== "maintenance") return false;
    if (notice.phase === "now") return true;
    const starts = new Date(notice.startsAt ?? "").getTime();
    return starts >= now && starts - now <= 2 * 60 * 60 * 1000;
  });
}

export type HealthState = "healthy" | "unreachable" | "offline";

export class NoticeHealth {
  private failures = 0;
  state: HealthState = "healthy";

  success(): HealthState {
    this.failures = 0;
    this.state = navigator.onLine === false ? "offline" : "healthy";
    return this.state;
  }

  failure(): HealthState {
    if (navigator.onLine === false) {
      this.state = "offline";
      return this.state;
    }
    this.failures += 1;
    if (this.failures >= 2) this.state = "unreachable";
    return this.state;
  }

  connectionChanged(): HealthState {
    this.state = navigator.onLine === false ? "offline" : this.failures >= 2 ? "unreachable" : "healthy";
    return this.state;
  }
}
