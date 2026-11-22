import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  dismissalKey,
  dismissNotice,
  isDismissed,
  lobbyNotices,
  type Notice,
  NoticeHealth,
  noticeTitle,
  showFullGameLine,
} from "./notices";

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: "25210000-0000-4000-8000-000000000001",
  revision: 1,
  kind: "incident",
  phase: "active",
  title: "Buzzers lag",
  body: "Looking into it",
  link: null,
  startsAt: null,
  endsAt: null,
  resolvedAt: null,
  resolution: null,
  ...over,
});

beforeEach(() => window.localStorage.clear());

test("formats every kind and phase", () => {
  expect(noticeTitle(notice())).toBe("Buzzers lag");
  expect(noticeTitle(notice({ phase: "resolved" }))).toBe("Resolved: Buzzers lag");
  expect(noticeTitle(notice({ kind: "whats_new", title: "Quick picks" }))).toBe("What's new: Quick picks");
  const start = new Date(2026, 10, 28, 21, 0);
  const end = new Date(2026, 10, 28, 21, 30);
  expect(
    noticeTitle(
      notice({ kind: "maintenance", phase: "upcoming", startsAt: start.toISOString(), endsAt: end.toISOString() }),
    ),
  ).toBe("Down for maintenance Sat 9:00–9:30 PM");
  expect(
    noticeTitle(
      notice({ kind: "maintenance", phase: "now", startsAt: start.toISOString(), endsAt: end.toISOString() }),
    ),
  ).toBe("Down for maintenance until 9:30 PM");
});

test("dismissal is keyed by revision and guarded", () => {
  const first = notice();
  expect(dismissalKey(first)).toContain(":1");
  dismissNotice(first);
  expect(isDismissed(first)).toBe(true);
  expect(isDismissed({ ...first, revision: 2 })).toBe(false);
  window.localStorage.setItem("schmegettes.dismissedNotices", "bad json");
  expect(isDismissed(first)).toBe(false);
});

test("lobby shows incidents and maintenance within two hours, with the game line only within one", () => {
  const now = new Date("2026-11-28T20:00:00Z");
  const in90 = notice({
    kind: "maintenance",
    phase: "upcoming",
    startsAt: new Date(now.getTime() + 90 * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + 120 * 60_000).toISOString(),
  });
  const in3h = notice({
    id: "2",
    kind: "maintenance",
    phase: "upcoming",
    startsAt: new Date(now.getTime() + 180 * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + 210 * 60_000).toISOString(),
  });
  const in40 = notice({
    id: "3",
    kind: "maintenance",
    phase: "upcoming",
    startsAt: new Date(now.getTime() + 40 * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + 70 * 60_000).toISOString(),
  });
  expect(lobbyNotices([notice(), in90, in3h], now.toISOString())).toEqual([notice(), in90]);
  expect(showFullGameLine(in90, now.toISOString())).toBe(false);
  expect(showFullGameLine(in40, now.toISOString())).toBe(true);
});

describe("health tracker", () => {
  test("needs two failures and clears on success", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const health = new NoticeHealth();
    expect(health.failure()).toBe("healthy");
    expect(health.failure()).toBe("unreachable");
    expect(health.success()).toBe("healthy");
  });

  test("offline overrides server reachability", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const health = new NoticeHealth();
    expect(health.failure()).toBe("offline");
    expect(health.success()).toBe("offline");
  });
});
