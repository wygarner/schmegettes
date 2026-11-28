import { describe, expect, test, vi } from "vitest";
import { createHostSound } from "./hostSound";

type Listener = () => void;

function fakeTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (type: string, fn: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    },
    removeEventListener: (type: string, fn: Listener) => listeners.get(type)?.delete(fn),
    fire: (type: string) => {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
}

/** An AudioContext whose resume() succeeds or not, as the test says. */
function fakeContext(state: string, resumes: boolean) {
  const target = fakeTarget();
  const ctx = {
    state,
    resume: vi.fn(async () => {
      if (resumes) ctx.state = "running";
    }),
    ...target,
  };
  return ctx;
}

function harness(ctxState: string, resumes: boolean) {
  const doc = { visibilityState: "visible" as DocumentVisibilityState, ...fakeTarget() };
  const win = fakeTarget();
  const ctx = fakeContext(ctxState, resumes);
  const sent: boolean[] = [];
  const blocked: boolean[] = [];
  const sound = createHostSound({
    context: () => ctx as unknown as AudioContext,
    doc: doc as unknown as Document,
    win: win as unknown as Window,
    send: (on) => sent.push(on),
    onBlocked: (b) => blocked.push(b),
    waitMs: 5,
  });
  return { doc, win, ctx, sent, blocked, sound };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("host sound", () => {
  test("running sound reports on and shows nothing", async () => {
    const h = harness("running", true);
    h.sound.start();
    await settle();
    expect(h.sent).toEqual([true]);
    expect(h.blocked).toEqual([]);
  });

  test("hiding the page reports off at once; coming back with sound reports on", async () => {
    const h = harness("running", true);
    h.sound.start();
    await settle();
    h.doc.visibilityState = "hidden";
    h.ctx.state = "suspended";
    h.doc.fire("visibilitychange");
    await settle();
    expect(h.sent).toEqual([true, false]);
    h.doc.visibilityState = "visible";
    h.doc.fire("visibilitychange");
    await settle();
    expect(h.ctx.resume).toHaveBeenCalled();
    expect(h.sent).toEqual([true, false, true]);
    expect(h.blocked).toEqual([]);
  });

  test("coming back when the browser won't resume asks for a tap, and the tap brings sound back", async () => {
    const h = harness("running", false);
    h.sound.start();
    await settle();
    h.ctx.state = "suspended";
    h.doc.visibilityState = "hidden";
    h.doc.fire("visibilitychange");
    h.doc.visibilityState = "visible";
    h.win.fire("pageshow");
    await settle();
    expect(h.blocked).toEqual([true]);
    expect(h.sent).toEqual([true, false]);

    h.ctx.resume.mockImplementation(async () => {
      h.ctx.state = "running";
    });
    await expect(h.sound.tap()).resolves.toBe(true);
    expect(h.blocked).toEqual([true, false]);
    expect(h.sent).toEqual([true, false, true]);
  });

  test("a tap that doesn't resume keeps the overlay", async () => {
    const h = harness("suspended", false);
    h.sound.start();
    await settle();
    await expect(h.sound.tap()).resolves.toBe(false);
    expect(h.blocked).toEqual([true]);
    expect(h.sent).toEqual([false]);
  });

  test("an interruption while visible is checked like a return", async () => {
    const h = harness("running", false);
    h.sound.start();
    await settle();
    h.ctx.state = "interrupted";
    h.ctx.fire("statechange");
    await settle();
    expect(h.sent).toEqual([true, false]);
    expect(h.blocked).toEqual([true]);
  });

  test("a failed narrator line asks for a tap", async () => {
    const h = harness("running", true);
    h.sound.start();
    await settle();
    h.sound.fail();
    expect(h.blocked).toEqual([true]);
    expect(h.sent).toEqual([true, false]);
  });

  test("resync reports again even when nothing changed", async () => {
    const h = harness("running", true);
    h.sound.start();
    await settle();
    await h.sound.resync();
    expect(h.sent).toEqual([true, true]);
  });

  test("stop removes the listeners", async () => {
    const h = harness("running", true);
    const stop = h.sound.start();
    await settle();
    stop();
    h.doc.visibilityState = "hidden";
    h.doc.fire("visibilitychange");
    await settle();
    expect(h.sent).toEqual([true]);
  });
});
