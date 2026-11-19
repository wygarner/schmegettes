import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_OPTIONS, fromRoom, isDefault, savedOptions, saveOptions, seasonList, summary } from "./gameOptions";

describe("summary", () => {
  test("empty with the defaults", () => expect(summary(DEFAULT_OPTIONS)).toBe(""));
  test("only what isn't the default", () => {
    expect(summary({ seasons: [20, 40], timers: "fast", doubleRound: false })).toBe(
      "Seasons 20–40 · Fast timers · No Double Schmegettes",
    );
    expect(summary({ seasons: [7, 7], timers: "standard", doubleRound: true })).toBe("Season 7");
    expect(summary({ seasons: null, timers: "relaxed", doubleRound: true })).toBe("Relaxed timers");
  });
});

describe("seasons to and from the API", () => {
  test("a range is every season in it; all is null", () => {
    expect(seasonList([3, 6])).toEqual([3, 4, 5, 6]);
    expect(seasonList(null)).toBeNull();
  });
  test("the API's list becomes a range; the full list is every season", () => {
    expect(fromRoom({ seasons: [5, 3, 4], timers: "fast", doubleRound: false })).toEqual({
      seasons: [3, 5],
      timers: "fast",
      doubleRound: false,
    });
    const all = Array.from({ length: 40 }, (_, i) => i + 1);
    expect(fromRoom({ seasons: all, timers: "standard", doubleRound: true }).seasons).toBeNull();
    expect(isDefault(fromRoom({ seasons: null, timers: "standard", doubleRound: true }))).toBe(true);
  });
});

describe("kept on this device", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  test("saved and read back", () => {
    const o = { seasons: [10, 20] as [number, number], timers: "fast" as const, doubleRound: false };
    saveOptions(o);
    expect(savedOptions()).toEqual(o);
  });
  test("nothing saved, junk, or blocked storage: the defaults", () => {
    expect(savedOptions()).toEqual(DEFAULT_OPTIONS);
    window.localStorage.setItem("schmegettes.gameOptions", '{"seasons":[30,2],"timers":"warp"}');
    expect(savedOptions()).toEqual(DEFAULT_OPTIONS);
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(savedOptions()).toEqual(DEFAULT_OPTIONS);
    expect(() => saveOptions(DEFAULT_OPTIONS)).not.toThrow();
  });
});
