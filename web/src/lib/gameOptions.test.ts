import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_OPTIONS, fromRoom, isDefault, savedOptions, saveOptions, seasonList } from "./gameOptions";

describe("isDefault", () => {
  test("any change from the defaults counts", () => {
    expect(isDefault(DEFAULT_OPTIONS)).toBe(true);
    expect(isDefault({ ...DEFAULT_OPTIONS, quickPicks: true })).toBe(false);
    expect(isDefault({ ...DEFAULT_OPTIONS, difficulty: "medium" })).toBe(false);
    expect(DEFAULT_OPTIONS.difficulty).toBeNull();
  });
});

describe("seasons to and from the API", () => {
  test("a range is every season in it; all is null", () => {
    expect(seasonList([3, 6])).toEqual([3, 4, 5, 6]);
    expect(seasonList(null)).toBeNull();
  });
  test("the API's list becomes a range; the full list is every season", () => {
    expect(fromRoom({ seasons: [5, 3, 4], doubleRound: false, quickPicks: false, difficulty: "hard" })).toEqual({
      seasons: [3, 5],
      doubleRound: false,
      quickPicks: false,
      difficulty: "hard",
    });
    expect(fromRoom({ seasons: null, doubleRound: true, quickPicks: false, difficulty: null }).difficulty).toBeNull();
    const all = Array.from({ length: 40 }, (_, i) => i + 1);
    expect(fromRoom({ seasons: all, doubleRound: true, quickPicks: false }).seasons).toBeNull();
    expect(isDefault(fromRoom({ seasons: null, doubleRound: true, quickPicks: false }))).toBe(true);
  });
});

describe("kept on this device", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  test("saved and read back", () => {
    const o = {
      seasons: [10, 20] as [number, number],
      doubleRound: false,
      quickPicks: true,
      difficulty: "easy" as const,
    };
    saveOptions(o);
    expect(savedOptions()).toEqual(o);
  });
  test("a timer pace saved before the option was removed is ignored", () => {
    window.localStorage.setItem("schmegettes.gameOptions", '{"seasons":[10,20],"timers":"fast","doubleRound":false}');
    expect(savedOptions()).toEqual({ seasons: [10, 20], doubleRound: false, quickPicks: false, difficulty: null });
  });
  test("options saved before Difficulty existed, or with an unknown one, are Any", () => {
    window.localStorage.setItem("schmegettes.gameOptions", '{"seasons":null,"doubleRound":true,"quickPicks":true}');
    expect(savedOptions().difficulty).toBeNull();
    window.localStorage.setItem("schmegettes.gameOptions", '{"difficulty":"extreme"}');
    expect(savedOptions().difficulty).toBeNull();
    window.localStorage.setItem("schmegettes.gameOptions", '{"difficulty":"medium"}');
    expect(savedOptions().difficulty).toBe("medium");
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
