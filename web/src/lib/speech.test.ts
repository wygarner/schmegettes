import { expect, test } from "vitest";
import { announcement, spokenText } from "./speech";

test("the pick announcement speaks the value as a plain number", () => {
  expect(announcement("VOLCANOES", 400)).toBe("Here's VOLCANOES for 400.");
  expect(announcement("OPERA", 1200)).toBe("Here's OPERA for 1200.");
});

test("an ampersand in a clue is read as and", () => {
  expect(spokenText("the Earth's crust & the human body")).toBe("the Earth's crust and the human body");
  expect(spokenText("Lewis&Clark")).toBe("Lewis and Clark");
  expect(spokenText("salt &amp; pepper")).toBe("salt and pepper");
  expect(spokenText("no ampersand")).toBe("no ampersand");
});
