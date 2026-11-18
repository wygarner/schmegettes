import { describe, expect, it } from "vitest";
import { formatCode, hostLabel, rotatesOnItsOwn, shortDate, timeLeft, utcTime } from "./format";

const host = {
  userId: "u",
  hostSince: "2026-11-12T00:00:00Z",
  note: null,
} as const;

describe("format", () => {
  it("shows codes the way hosts type them", () => {
    expect(formatCode("K7RXM2PQ")).toBe("K7RX-M2PQ");
  });

  it("shows times in UTC, whatever the computer's zone", () => {
    expect(utcTime("2026-11-17T13:30:00Z")).toBe("13:30 UTC");
    expect(shortDate("2026-11-12T23:30:00Z")).toBe("Nov 12");
  });

  it("counts down in whole minutes", () => {
    expect(timeLeft(31 * 60_000 + 59_000)).toBe("31 min");
    expect(timeLeft(59_000)).toBe("under a minute");
  });

  it("knows the local seeded code never rotates", () => {
    expect(rotatesOnItsOwn("2026-11-17T12:45:00Z", "2026-11-17T12:00:00Z")).toBe(true);
    expect(rotatesOnItsOwn("9999-01-01T00:00:00Z", "2026-11-17T12:00:00Z")).toBe(false);
  });

  it("labels accounts by email and guests by their last name", () => {
    expect(hostLabel({ ...host, kind: "account", email: "sam@example.com", lastPlayedAs: null })).toBe(
      "sam@example.com",
    );
    expect(hostLabel({ ...host, kind: "guest", email: null, lastPlayedAs: "Priya" })).toBe('Guest · "Priya"');
    expect(hostLabel({ ...host, kind: "guest", email: null, lastPlayedAs: null })).toBe("Guest");
  });
});
