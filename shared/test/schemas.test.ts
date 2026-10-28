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
  test("accepts gameplay intents", () => {
    expect(client({ type: "reading_done", clueId: CLUE })).toBe(true);
    expect(client({ type: "answer_progress", clueId: CLUE, text: "what is nit" })).toBe(true);
    expect(client({ type: "select_clue", clueId: CLUE })).toBe(true);
    expect(client({ type: "submit_answer", clueId: CLUE, answer: "nitrogen", source: "voice" })).toBe(true);
    expect(client({ type: "answer_progress", clueId: CLUE, text: "x".repeat(201) })).toBe(false);
  });
  test("accepts lobby intents", () => {
    expect(client({ type: "set_display_name", displayName: "Alice" })).toBe(true);
    expect(client({ type: "set_host_plays", plays: true })).toBe(true);
    expect(client({ type: "leave_room" })).toBe(true);
  });
  test("rejects empty or long display names", () => {
    expect(client({ type: "set_display_name", displayName: "" })).toBe(false);
    expect(client({ type: "set_display_name", displayName: "x".repeat(21) })).toBe(false);
  });
  test("accepts a buzz", () => {
    expect(client({ type: "buzz", clueId: CLUE, clientSentAt: 1 })).toBe(true);
  });
  test("rejects unknown fields and types", () => {
    expect(client({ type: "buzz", clueId: CLUE, extra: 1 })).toBe(false);
    expect(client({ type: "cheat" })).toBe(false);
  });
});

describe("server messages", () => {
  test("accepts gameplay messages", () => {
    const clue = { clueId: CLUE, category: "SCIENCE", value: 400, state: "active" };
    expect(server({ type: "answer_progress", roomId: ROOM, seq: 1, userId: USER, text: "nit" })).toBe(true);
    expect(
      server({ type: "clue_ended", roomId: ROOM, seq: 2, clueId: CLUE, state: "answered", scores: { [USER]: 400 } }),
    ).toBe(true);
    expect(server({ type: "round_started", roomId: ROOM, seq: 3, round: "double", board: [clue] })).toBe(true);
    expect(
      server({
        type: "game_over",
        roomId: ROOM,
        seq: 4,
        results: [{ userId: USER, displayName: "Alice", score: 1200, placement: 1 }],
      }),
    ).toBe(true);
    expect(server({ type: "game_paused", roomId: ROOM, seq: 5, paused: true })).toBe(true);
    expect(
      server({
        type: "phase_changed",
        roomId: ROOM,
        seq: 6,
        phase: "answering",
        activeClue: clue,
        answeringUserId: USER,
        attemptedUserIds: [USER],
        deadlineAt: 1,
      }),
    ).toBe(true);
  });
  test("a clue_ended never carries unknown fields", () => {
    expect(
      server({ type: "clue_ended", roomId: ROOM, seq: 2, clueId: CLUE, state: "answered", scores: {}, clueText: "x" }),
    ).toBe(false);
  });
  test("accepts a lobby update and a room closure", () => {
    const player = { userId: USER, displayName: "Alice", role: "contestant", score: 0, connected: true };
    const lobby = {
      type: "lobby_updated",
      roomId: ROOM,
      seq: 2,
      hostUserId: USER,
      hostDisplayName: "Wyatt",
      hostPlays: false,
      maxPlayers: 6,
      players: [player],
    };
    expect(server(lobby)).toBe(true);
    expect(server({ type: "room_closed", roomId: ROOM, seq: 3, reason: "replaced" })).toBe(true);
    expect(server({ type: "room_closed", roomId: ROOM, seq: 0, reason: "closed" })).toBe(true);
    expect(server({ type: "room_closed", roomId: ROOM, seq: 3, reason: "bored" })).toBe(false);
  });
  test("accepts the lobby error codes", () => {
    expect(server({ type: "error", code: "not_enough_players" })).toBe(true);
  });
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
  test("accepts the building_board phase", () => {
    expect(server({ type: "phase_changed", roomId: ROOM, seq: 1, phase: "building_board" })).toBe(true);
  });
});

describe("jobs", () => {
  test("accepts an import job", () => {
    expect(job({ kind: "import_clue_season", jobId: USER, enqueuedAt: "2026-10-26T12:00:00Z", season: 40 })).toBe(true);
  });
  test("rejects build_board: boards are built by start_game() in the database", () => {
    expect(job({ kind: "build_board", jobId: USER, enqueuedAt: "2026-10-26T12:00:00Z", roomId: ROOM })).toBe(false);
  });
});
