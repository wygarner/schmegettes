import { expect, test } from "vitest";
import { initialRoom, type RoomState } from "../lib/room";
import { buzzerState, canPick } from "./buzzerState";

const me = "me";
const clue = { clueId: "c1", category: "SCIENCE", value: 400, state: "active" as const };
const board: RoomState = { ...initialRoom, phase: "board", controllingUserId: me };

test("the player in control on the board gets pick, and listening while a spoken pick listens", () => {
  expect(canPick(board, me)).toBe(true);
  expect(buzzerState(board, me, false)).toBe("pick");
  expect(buzzerState(board, me, false, true)).toBe("listening");
});

test("everyone else on the board is idle", () => {
  expect(canPick(board, "bob")).toBe(false);
  expect(buzzerState(board, "bob", false)).toBe("idle");
});

test("no pick while paused, between rounds, after the game, or off the board", () => {
  for (const s of [
    { ...board, paused: true },
    { ...board, roundIntro: "double" as const },
    { ...board, results: [{ userId: me, displayName: "Alice", score: 0, placement: 1 }] },
    { ...board, clueEnd: { state: "answered" as const } },
    { ...board, phase: "clue_reading" as const, activeClue: clue },
  ]) {
    expect(canPick(s, me)).toBe(false);
    expect(buzzerState(s, me, false, true)).not.toBe("pick");
    expect(buzzerState(s, me, false, true)).not.toBe("listening");
  }
});

test("buzzing states are unchanged", () => {
  const reading: RoomState = { ...initialRoom, phase: "clue_reading", activeClue: clue };
  expect(buzzerState(reading, me, false)).toBe("dim");
  expect(buzzerState(reading, me, true)).toBe("early");
  expect(buzzerState({ ...reading, phase: "buzzing_open" }, me, false)).toBe("lit");
  expect(buzzerState({ ...reading, phase: "answering", answeringUserId: me }, me, false)).toBe("answering");
  expect(buzzerState({ ...reading, phase: "buzzing_open", attemptedUserIds: [me] }, me, false)).toBe("locked");
});
