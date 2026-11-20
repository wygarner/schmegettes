import { afterEach, describe, expect, test, vi } from "vitest";
import { getSavedVoice, narratorChoice, piperChoiceValue, saveVoice } from "./narratorVoice";

const AVA = "com.apple.voice.premium.en-US.Ava";

describe("storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  test("saves and reads the voice", () => {
    expect(getSavedVoice()).toBeNull();
    saveVoice(piperChoiceValue("john"));
    expect(getSavedVoice()).toBe("piper:john");
  });
  test("blocked storage means nothing saved, and saving doesn't throw", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getSavedVoice()).toBeNull();
    expect(() => saveVoice(piperChoiceValue("john"))).not.toThrow();
  });
});

describe("narratorChoice", () => {
  afterEach(() => window.localStorage.clear());
  test("nothing saved: the default Schmegettes voice, Norman", () => {
    expect(narratorChoice()).toEqual({ kind: "piper", id: "norman" });
  });
  test("a saved Schmegettes voice", () => {
    saveVoice(piperChoiceValue("john"));
    expect(narratorChoice()).toEqual({ kind: "piper", id: "john" });
  });
  test("a host who picked Kristin keeps her", () => {
    saveVoice(piperChoiceValue("kristin"));
    expect(narratorChoice()).toEqual({ kind: "piper", id: "kristin" });
  });
  test("a built-in voice saved earlier becomes the default Schmegettes voice", () => {
    saveVoice(AVA);
    expect(narratorChoice()).toEqual({ kind: "piper", id: "norman" });
  });
  test("an unknown Schmegettes voice falls back to the default", () => {
    saveVoice("piper:zarvox");
    expect(narratorChoice()).toEqual({ kind: "piper", id: "norman" });
  });
});
