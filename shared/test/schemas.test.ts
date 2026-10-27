import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const dir = join(import.meta.dir, "..", "schemas");
const load = (p: string) => JSON.parse(readFileSync(join(dir, p), "utf8"));

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(load("domain.schema.json"));
const client = ajv.compile(load("protocol/client-message.schema.json"));
const server = ajv.compile(load("protocol/server-message.schema.json"));
const job = ajv.compile(load("jobs/job.schema.json"));

const ROOM = "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11";
const USER = "0b8a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const CLUE = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";

describe("client messages", () => {
  test("accepts a buzz", () => {
    expect(client({ type: "buzz", clueId: CLUE, clientSentAt: 1 })).toBe(true);
  });
  test("rejects unknown fields and types", () => {
    expect(client({ type: "buzz", clueId: CLUE, extra: 1 })).toBe(false);
    expect(client({ type: "cheat" })).toBe(false);
  });
});

describe("server messages", () => {
  test("accepts a buzz result", () => {
    expect(server({ type: "buzz_result", roomId: ROOM, seq: 3, userId: USER, outcome: "won" })).toBe(true);
  });
  test("requires the envelope fields", () => {
    expect(server({ type: "buzz_result", userId: USER, outcome: "won" })).toBe(false);
  });
  test("never carries the correct response on a board clue", () => {
    const snapshot = {
      type: "room_snapshot",
      roomId: ROOM,
      seq: 0,
      phase: "board",
      round: "single",
      players: [],
      board: [{ clueId: CLUE, category: "POTPOURRI", value: 200, state: "unplayed", correctResponse: "x" }],
    };
    expect(server(snapshot)).toBe(false);
  });
});

describe("jobs", () => {
  test("accepts an import job", () => {
    expect(job({ kind: "import_clue_season", jobId: USER, enqueuedAt: "2026-10-26T12:00:00Z", season: 40 })).toBe(true);
  });
});
