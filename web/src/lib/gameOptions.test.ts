import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_OPTIONS, fromRoom, isDefault, savedOptions, saveOptions, seasonList, summary } from "./gameOptions";

describe("summary", () => {
  test("empty with the defaults", () => expect(summary(DEFAULT_OPTIONS)).toBe(""));
  test("only what isn't the default", () => {
    expect(summary({ seasons: [20, 40], doubleRound: false, quickPicks: false })).toBe(
      "Seasons 20–40 · No Double Schmegettes",
    );
    expect(summary({ seasons: [7, 7], doubleRound: true, quickPicks: false })).toBe("Season 7");
    expect(summary({ seasons: null, doubleRound: false, quickPicks: true })).toBe(
      "No Double Schmegettes · Quick picks",
    );
    expect(isDefault({ ...DEFAULT_OPTIONS, quickPicks: true })).toBe(false);
  });
});

describe("seasons to and from the API", () => {
  test("a range is every season in it; all is null", () => {
    expect(seasonList([3, 6])).toEqual([3, 4, 5, 6]);
    expect(seasonList(null)).toBeNull();
  });
  test("the API's list becomes a range; the full list is every season", () => {
    expect(fromRoom({ seasons: [5, 3, 4], doubleRound: false, quickPicks: false })).toEqual({
      seasons: [3, 5],
      doubleRound: false,
      quickPicks: false,
    });
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
    const o = { seasons: [10, 20] as [number, number], doubleRound: false, quickPicks: true };
    saveOptions(o);
    expect(savedOptions()).toEqual(o);
  });
  test("a timer pace saved before the option was removed is ignored", () => {
    window.localStorage.setItem("schmegettes.gameOptions", '{"seasons":[10,20],"timers":"fast","doubleRound":false}');
    expect(savedOptions()).toEqual({ seasons: [10, 20], doubleRound: false, quickPicks: false });
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
