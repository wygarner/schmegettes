import { expect, test, vi } from "vitest";
import { enforceFullscreen } from "./fullscreen";

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
