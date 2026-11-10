import { expect, test } from "vitest";
import { announcement } from "./speech";

test("the pick announcement speaks the value as a plain number", () => {
  expect(announcement("VOLCANOES", 400)).toBe("Here's VOLCANOES for 400.");
  expect(announcement("OPERA", 1200)).toBe("Here's OPERA for 1200.");
});
