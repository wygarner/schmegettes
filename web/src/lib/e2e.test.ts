import { afterEach, describe, expect, it, vi } from "vitest";
import { e2eEnabled, installE2E, resetE2EForTest, say } from "./e2e";
import { e2eActive } from "./e2eFlag";
import { narrate } from "./narrator";
import { prepareVoice } from "./piper/engine";
import { voiceStatus } from "./piper/voices";
import { createRecognizer, recognitionSupported, requestAnswerPermissions } from "./speech";

function openWith(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

afterEach(() => {
  resetE2EForTest();
  vi.unstubAllEnvs();
  openWith("");
});

describe("E2E mode", () => {
  it("is off by default", () => {
    expect(e2eEnabled()).toBe(false);
    expect(installE2E()).toBe(false);
    expect(e2eActive()).toBe(false);
    expect(window.__e2e).toBeUndefined();
  });

  it("turns on with ?e2e=1 and stays on for the tab", () => {
    openWith("?e2e=1");
    expect(installE2E()).toBe(true);
    expect(e2eActive()).toBe(true);
    expect(window.__e2e).toBeDefined();
    openWith("");
    expect(e2eEnabled()).toBe(true);
  });

  it("stays off in a production build, even with ?e2e=1", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ENV", "production");
    openWith("?e2e=1");
    expect(installE2E()).toBe(false);
    expect(e2eActive()).toBe(false);
  });

  it("stays off in a build with no VITE_ENV", () => {
    vi.stubEnv("DEV", false);
    openWith("?e2e=1");
    expect(e2eEnabled()).toBe(false);
  });

  it("is allowed in a staging build", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ENV", "staging");
    openWith("?e2e=1");
    expect(installE2E()).toBe(true);
  });

  it("say() delivers the text to the recognizer that is listening, once", () => {
    openWith("?e2e=1");
    installE2E();
    expect(recognitionSupported()).toBe(true);
    const rec = createRecognizer();
    const finals: string[] = [];
    if (!rec) throw new Error("no recognizer");
    rec.onFinal = (text) => finals.push(text);
    expect(say("too early")).toBe(false);
    rec.start();
    expect(window.__e2e?.listening()).toBe(true);
    expect(say("What is Paris")).toBe(true);
    rec.stop();
    expect(finals).toEqual(["What is Paris"]);
    expect(window.__e2e?.listening()).toBe(false);
  });

  it("a listen stopped before anything is said ends with an empty transcript", () => {
    openWith("?e2e=1");
    installE2E();
    const rec = createRecognizer();
    const finals: string[] = [];
    if (!rec) throw new Error("no recognizer");
    rec.onFinal = (text) => finals.push(text);
    rec.start();
    rec.stop();
    expect(finals).toEqual([""]);
  });

  it("grants the microphone through the scripted recognizer", async () => {
    openWith("?e2e=1");
    installE2E();
    await expect(requestAnswerPermissions()).resolves.toBe("granted");
  });

  it("narration ends at once and every voice is ready without a download", async () => {
    openWith("?e2e=1");
    installE2E();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(prepareVoice("norman")).resolves.toBe(true);
    expect(voiceStatus("norman")).toEqual({ state: "ready" });
    await expect(narrate("This clue is read instantly.")).resolves.toBe("ended");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
