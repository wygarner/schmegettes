import { expect, test } from "vitest";
import { spokenText } from "./speech";

test("an ampersand in a clue is read as and", () => {
  expect(spokenText("the Earth's crust & the human body")).toBe("the Earth's crust and the human body");
  expect(spokenText("Lewis&Clark")).toBe("Lewis and Clark");
  expect(spokenText("salt &amp; pepper")).toBe("salt and pepper");
  expect(spokenText("no ampersand")).toBe("no ampersand");
});
