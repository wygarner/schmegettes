import { describe, expect, test, vi } from "vitest";
import { enforceFullscreen, needsHomeScreenTip } from "./fullscreen";

function fakeWindow({ enabled = true, installed = false } = {}) {
  const listeners: Record<string, () => void> = {};
  const requestFullscreen = vi.fn(() => Promise.resolve());
  const doc = {
    fullscreenEnabled: enabled,
    fullscreenElement: null as unknown,
    documentElement: { requestFullscreen },
  };
  const win = {
    document: doc,
    matchMedia: () => ({ matches: installed }),
    addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
  } as unknown as Window;
  return { win, doc, listeners, requestFullscreen };
}

test("asks for fullscreen with the toolbar hidden on each gesture until it is fullscreen", () => {
  const { win, doc, listeners, requestFullscreen } = fakeWindow();
  enforceFullscreen(win);
  listeners.pointerup?.();
  expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
  listeners.keyup?.();
  expect(requestFullscreen).toHaveBeenCalledTimes(2);
  doc.fullscreenElement = {};
  listeners.pointerup?.();
  expect(requestFullscreen).toHaveBeenCalledTimes(2);
});

test("does nothing when installed or when fullscreen is unavailable", () => {
  for (const opts of [{ installed: true }, { enabled: false }]) {
    const { win, listeners } = fakeWindow(opts);
    enforceFullscreen(win);
    expect(Object.keys(listeners)).toEqual([]);
  }
});

describe("needsHomeScreenTip", () => {
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1";
  const IPAD_SAFARI =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15";
  const IPHONE_CHROME =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 CriOS/131.0 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
  const win = (userAgent: string, { touch = 5, standalone = false, installed = false } = {}) =>
    ({
      navigator: { userAgent, maxTouchPoints: touch, standalone },
      matchMedia: () => ({ matches: installed }),
    }) as unknown as Window;

  test("iPhone and iPad Safari in the browser", () => {
    expect(needsHomeScreenTip(win(IPHONE_SAFARI))).toBe(true);
    expect(needsHomeScreenTip(win(IPAD_SAFARI))).toBe(true);
  });
  test("not from the Home Screen", () => {
    expect(needsHomeScreenTip(win(IPHONE_SAFARI, { standalone: true }))).toBe(false);
    expect(needsHomeScreenTip(win(IPHONE_SAFARI, { installed: true }))).toBe(false);
  });
  test("not other browsers or devices", () => {
    expect(needsHomeScreenTip(win(IPHONE_CHROME))).toBe(false);
    expect(needsHomeScreenTip(win(ANDROID))).toBe(false);
    expect(needsHomeScreenTip(win(IPAD_SAFARI, { touch: 0 }))).toBe(false); // a Mac
  });
});
