import { expect, test } from "vitest";
import { formatHostCode, isCompleteHostCode } from "./hostAccess";

test("formats a host code as typed", () => {
  expect(formatHostCode("k7rx")).toBe("K7RX");
  expect(formatHostCode("k7rxm")).toBe("K7RX-M");
  expect(formatHostCode("k7 rx-m2pq")).toBe("K7RX-M2PQ");
  expect(formatHostCode("K7RX-M2PQ-EXTRA")).toBe("K7RX-M2PQ");
  // Look-alikes are never in a code, so they're dropped.
  expect(formatHostCode("0O1IL")).toBe("");
});

test("a code is complete at 8 characters", () => {
  expect(isCompleteHostCode("K7RX-M2P")).toBe(false);
  expect(isCompleteHostCode("K7RX-M2PQ")).toBe(true);
});
