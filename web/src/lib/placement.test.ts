import { expect, test } from "vitest";
import { detailWhen, listWhen, ordinal } from "./placement";

test("ordinals", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
    "1st",
    "2nd",
    "3rd",
    "4th",
    "11th",
    "12th",
    "13th",
    "21st",
    "22nd",
    "101st",
  ]);
});

test("Today in the list; the date otherwise", () => {
  const now = new Date(2026, 10, 9, 22, 0);
  expect(listWhen(new Date(2026, 10, 9, 20, 14).toISOString(), now)).toBe("Today, 8:14 PM");
  expect(listWhen(new Date(2026, 9, 26, 20, 14).toISOString(), now)).toBe("Oct 26, 8:14 PM");
});

test("a scoreboard's date and length", () => {
  const start = new Date(2026, 9, 26, 20, 14).toISOString();
  expect(detailWhen(start, new Date(2026, 9, 26, 20, 55).toISOString())).toBe("Oct 26, 2026 · 8:14 PM · 41 min");
  expect(detailWhen(start, null)).toBe("Oct 26, 2026 · 8:14 PM");
});
