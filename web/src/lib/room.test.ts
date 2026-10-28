import { expect, test } from "vitest";
import { contestantCount, initialRoom, reduceRoom } from "./room";

const ROOM = "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11";
const alice = { userId: "a", displayName: "Alice", role: "contestant" as const, score: 0, connected: true };
const host = { userId: "h", displayName: "Wyatt", role: "host" as const, score: 0, connected: true };

test("a snapshot opens the room", () => {
  const s = reduceRoom(initialRoom, {
    type: "room_snapshot",
    roomId: ROOM,
    seq: 3,
    phase: "lobby",
    round: "single",
    players: [alice],
    board: [],
    hostDisplayName: "Wyatt",
    hostPlays: false,
    maxPlayers: 6,
  });
  expect(s).toMatchObject({ connection: "open", hostDisplayName: "Wyatt", maxPlayers: 6, players: [alice] });
});

test("lobby updates, phases, errors, drops, and closing", () => {
  let s = reduceRoom(
    { ...initialRoom, connection: "open" },
    {
      type: "lobby_updated",
      roomId: ROOM,
      seq: 4,
      hostUserId: "h",
      hostDisplayName: "Wyatt",
      hostPlays: true,
      maxPlayers: 6,
      players: [host, alice],
    },
  );
  expect(contestantCount(s)).toBe(2);
  s = reduceRoom(s, { type: "phase_changed", roomId: ROOM, seq: 5, phase: "building_board" });
  expect(s.phase).toBe("building_board");
  s = reduceRoom(s, { type: "error", code: "not_enough_players" });
  expect(s.error?.code).toBe("not_enough_players");
  s = reduceRoom(s, { type: "clear_error" });
  expect(s.error).toBeUndefined();
  s = reduceRoom(s, { type: "dropped" });
  expect(s.connection).toBe("reconnecting");
  s = reduceRoom(s, { type: "room_closed", roomId: ROOM, seq: 6, reason: "replaced" });
  expect(s.connection).toBe("closed");
  expect(reduceRoom(s, { type: "dropped" }).connection).toBe("closed");
});

const clue = { clueId: "c1", category: "SCIENCE", value: 400, state: "active" as const };

test("a clue's life: reading, lockout, answering, verdict, end", () => {
  let s = reduceRoom(
    { ...initialRoom, connection: "open", board: [{ ...clue, state: "unplayed" }] },
    { type: "phase_changed", roomId: ROOM, seq: 1, phase: "clue_reading", activeClue: clue, deadlineAt: 10 },
  );
  expect(s.board[0]?.state).toBe("active");
  s = reduceRoom(s, {
    type: "buzz_result",
    roomId: ROOM,
    seq: 2,
    userId: "a",
    outcome: "locked_out",
    lockoutUntil: 99,
  });
  expect(s.lockouts.a).toBe(99);
  s = reduceRoom(s, { type: "phase_changed", roomId: ROOM, seq: 3, phase: "answering", answeringUserId: "a" });
  s = reduceRoom(s, { type: "answer_progress", roomId: ROOM, seq: 4, userId: "a", text: "what is nit" });
  expect(s.liveText).toBe("what is nit");
  s = reduceRoom(s, {
    type: "answer_judged",
    roomId: ROOM,
    seq: 5,
    answerId: "x",
    userId: "a",
    answer: "nitrogen",
    verdict: "correct",
    scoreDelta: 400,
    scores: { a: 400 },
  });
  expect(s.scores.a).toBe(400);
  expect(s.lastVerdict?.verdict).toBe("correct");
  s = reduceRoom(s, {
    type: "clue_ended",
    roomId: ROOM,
    seq: 6,
    clueId: "c1",
    state: "answered",
    correctResponse: "Nitrogen",
    controllingUserId: "a",
    scores: { a: 400 },
  });
  expect(s.board[0]?.state).toBe("answered");
  expect(s.clueEnd?.correctResponse).toBe("Nitrogen");
  expect(s.controllingUserId).toBe("a");
  s = reduceRoom(s, { type: "phase_changed", roomId: ROOM, seq: 7, phase: "board" });
  expect(s.activeClue).toBeUndefined();
  expect(s.clueEnd).toBeUndefined();
});

test("rounds, pause, and game over", () => {
  let s = reduceRoom(
    { ...initialRoom, connection: "open" },
    { type: "round_started", roomId: ROOM, seq: 1, round: "double", board: [clue], controllingUserId: "b" },
  );
  expect(s).toMatchObject({ round: "double", roundIntro: "double", controllingUserId: "b" });
  s = reduceRoom(s, { type: "phase_changed", roomId: ROOM, seq: 2, phase: "board" });
  expect(s.roundIntro).toBeUndefined();
  s = reduceRoom(s, { type: "game_paused", roomId: ROOM, seq: 3, paused: true });
  expect(s.paused).toBe(true);
  s = reduceRoom(s, {
    type: "game_over",
    roomId: ROOM,
    seq: 4,
    results: [{ userId: "a", displayName: "Alice", score: 1, placement: 1 }],
  });
  expect(s.results).toHaveLength(1);
});
