import type { ApiComponents } from "@schmegettes/shared";

export type Notice = ApiComponents["schemas"]["Notice"];

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function timeRange(start: Date, end: Date, withDay: boolean): string {
  let first = time.format(start);
  const last = time.format(end);
  const suffix = last.match(/\s(AM|PM)$/)?.[0];
  if (suffix && first.endsWith(suffix)) first = first.slice(0, -suffix.length);
  return `${withDay ? `${weekday.format(start)} ` : ""}${first}–${last}`;
}

export function noticeTitle(notice: Notice): string {
  if (notice.kind === "incident") return notice.phase === "resolved" ? `Resolved: ${notice.title}` : notice.title;
  if (notice.kind === "whats_new") return `What's new: ${notice.title}`;
  const end = new Date(notice.endsAt ?? "");
  if (notice.phase === "now") return `Down for maintenance until ${time.format(end)}`;
  return `Down for maintenance ${timeRange(new Date(notice.startsAt ?? ""), end, true)}`;
}

export function lobbyTitle(notice: Notice, serverTime: string): string {
  if (notice.kind === "incident") return notice.title;
  const start = new Date(notice.startsAt ?? "");
  const end = new Date(notice.endsAt ?? "");
  if (notice.phase === "now") return `Down for maintenance until ${time.format(end)}`;
  const minutes = Math.max(0, Math.round((start.getTime() - new Date(serverTime).getTime()) / 60_000));
  return `Down for maintenance ${timeRange(start, end, false)} (in ${minutes} min).`;
}

export function showFullGameLine(notice: Notice, serverTime: string): boolean {
  if (notice.kind !== "maintenance" || notice.phase !== "upcoming" || !notice.startsAt) return false;
  const until = new Date(notice.startsAt).getTime() - new Date(serverTime).getTime();
  return until >= 0 && until <= 60 * 60 * 1000;
}
