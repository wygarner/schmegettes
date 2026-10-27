import { afterEach, expect, test, vi } from "vitest";
import { getLastName, isValidName, setLastName } from "./displayName";

afterEach(() => vi.restoreAllMocks());

test("remembers the trimmed name", () => {
  setLastName("  Ann ");
  expect(getLastName()).toBe("Ann");
});

test("works when storage throws", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => setLastName("Ann")).not.toThrow();
  expect(getLastName()).toBe("");
});

test("names are 1 to 20 characters after trimming", () => {
  expect(isValidName(" ")).toBe(false);
  expect(isValidName("A")).toBe(true);
  expect(isValidName("x".repeat(20))).toBe(true);
  expect(isValidName("x".repeat(21))).toBe(false);
});
