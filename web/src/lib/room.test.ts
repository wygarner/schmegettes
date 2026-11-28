import { describe, expect, test } from "vitest";
import { contestantCount, initialRoom, type RoomState, reduceRoom } from "./room";

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

test("a new clue clears who has tried, even though the server omits an empty list", () => {
  let s = reduceRoom(
    { ...initialRoom, connection: "open" },
    { type: "phase_changed", roomId: ROOM, seq: 1, phase: "buzzing_open", activeClue: clue, attemptedUserIds: ["a"] },
  );
  expect(s.attemptedUserIds).toEqual(["a"]);
  // Go's encoder drops an empty attemptedUserIds, so the next clue's reading arrives without it.
  s = reduceRoom(s, {
    type: "phase_changed",
    roomId: ROOM,
    seq: 2,
    phase: "clue_reading",
    activeClue: { ...clue, clueId: "c2" },
  });
  expect(s.attemptedUserIds).toEqual([]);
});

const ddClue = { clueId: "c1", category: "SCIENCE", value: 400, state: "active" as const, dailyDouble: true };

test("a Daily Double wager is public; a Final wager is kept only as the owner's own", () => {
  let s = reduceRoom(
    { ...initialRoom, connection: "open" },
    {
      type: "phase_changed",
      roomId: ROOM,
      seq: 1,
      phase: "daily_double_wager",
      activeClue: ddClue,
      wagerMin: 5,
      wagerMax: 800,
    },
  );
  expect(s).toMatchObject({ wagerMin: 5, wagerMax: 800, wager: undefined });
  s = reduceRoom(s, { type: "wager_locked", roomId: ROOM, seq: 2, userId: "a", amount: 600 });
  expect(s.wager).toBe(600);

  s = reduceRoom(s, {
    type: "phase_changed",
    roomId: ROOM,
    seq: 3,
    phase: "final_category",
    activeClue: { clueId: "f", category: "ISLANDS", value: 0, state: "unplayed" },
    finalistUserIds: ["a", "b"],
  });
  expect(s).toMatchObject({ round: "final", finalistUserIds: ["a", "b"], wager: undefined });
  s = reduceRoom(s, { type: "wager_locked", roomId: ROOM, seq: 4, userId: "b" });
  expect(s).toMatchObject({ lockedUserIds: ["b"], mine: {} });
  s = reduceRoom(s, { type: "wager_locked", roomId: ROOM, seq: 5, userId: "a", amount: 300 });
  expect(s).toMatchObject({ lockedUserIds: ["b", "a"], mine: { wager: 300 } });
});

test("Final answers, the reveal, and a skipped Final", () => {
  let s = reduceRoom(
    { ...initialRoom, connection: "open", phase: "final_wager" },
    { type: "phase_changed", roomId: ROOM, seq: 1, phase: "final_answer", finalistUserIds: ["a", "b"] },
  );
  expect(s.lockedUserIds).toEqual([]);
  s = reduceRoom(s, { type: "final_submitted", roomId: ROOM, seq: 2, userId: "a", answer: "krakatoa" });
  expect(s).toMatchObject({ lockedUserIds: ["a"], mine: { answer: "krakatoa", submitted: true } });

  s = reduceRoom(s, { type: "phase_changed", roomId: ROOM, seq: 3, phase: "final_reveal", revealOrder: ["b", "a"] });
  s = reduceRoom(s, {
    type: "answer_judged",
    roomId: ROOM,
    seq: 4,
    answerId: "x",
    userId: "b",
    answer: "",
    verdict: "incorrect",
    scoreDelta: -200,
    wager: 200,
    scores: { a: 900, b: 0 },
  });
  expect(s.reveals).toEqual([
    { answerId: "x", userId: "b", answer: "", verdict: "incorrect", delta: -200, wager: 200 },
  ]);
  expect(s.lastVerdict).toBeUndefined();

  s = reduceRoom(s, { type: "game_over", roomId: ROOM, seq: 5, results: [], finalSkipped: true });
  expect(s.finalSkipped).toBe(true);
});

test("a snapshot restores this player's own Final state", () => {
  const s = reduceRoom(initialRoom, {
    type: "room_snapshot",
    roomId: ROOM,
    seq: 9,
    phase: "final_answer",
    round: "final",
    players: [alice],
    board: [],
    finalistUserIds: ["a"],
    myWager: 400,
    myFinalAnswer: "krak",
    myFinalSubmitted: false,
  });
  expect(s.mine).toEqual({ wager: 400, answer: "krak", submitted: false });
  expect(s.finalistUserIds).toEqual(["a"]);
});

test("a snapshot carries the game's Quick picks; false when absent", () => {
  const snap = {
    type: "room_snapshot" as const,
    roomId: ROOM,
    seq: 1,
    phase: "board" as const,
    round: "single" as const,
    players: [alice],
    board: [],
  };
  expect(reduceRoom(initialRoom, { ...snap, quickPicks: true }).quickPicks).toBe(true);
  expect(reduceRoom(initialRoom, snap).quickPicks).toBe(false);
});

describe("overrides, the scoreboard and Rematch", () => {
  const players = [
    { userId: "a", displayName: "Alice", role: "contestant" as const, score: 0, connected: true },
    { userId: "b", displayName: "Bob", role: "contestant" as const, score: 0, connected: true },
  ];
  const playing: RoomState = { ...initialRoom, connection: "open", phase: "answering", players };
  const judged = (s: RoomState, answerId: string, userId: string, verdict: string, delta: number) =>
    reduceRoom(s, {
      type: "answer_judged",
      roomId: "r",
      seq: 1,
      answerId,
      userId,
      answer: "x",
      verdict: verdict as "correct" | "incorrect",
      scoreDelta: delta,
      scores: {},
    });

  test("an override applies the later answers it voided", () => {
    let s = judged(playing, "a1", "b", "incorrect", -400);
    s = judged(s, "a2", "a", "correct", 400);
    s = reduceRoom(s, {
      type: "verdict_overridden",
      roomId: "r",
      seq: 2,
      answerId: "a1",
      userId: "b",
      verdict: "overridden_correct",
      scoreDelta: 400,
      scores: { a: 0, b: 400 },
      controllingUserId: "b",
      voided: [{ answerId: "a2", userId: "a", verdict: "voided", scoreDelta: 0 }],
    });
    expect(s.answers[1]).toMatchObject({ verdict: "voided", delta: 0 });
    expect(s.scores).toEqual({ a: 0, b: 400 });
    expect(s.controllingUserId).toBe("b");
  });

  test("a clue's judged answers are kept for overrides; an override flips one", () => {
    let s = judged(playing, "a1", "b", "incorrect", -400);
    s = judged(s, "a2", "a", "correct", 400);
    expect(s.answers.map((a) => a.answerId)).toEqual(["a1", "a2"]);
    s = reduceRoom(s, {
      type: "verdict_overridden",
      roomId: "r",
      seq: 2,
      answerId: "a1",
      userId: "b",
      verdict: "overridden_correct",
      scoreDelta: 400,
      scores: { a: 400, b: 400 },
      controllingUserId: "a",
    });
    expect(s.answers[0]).toMatchObject({ verdict: "overridden_correct", delta: 400 });
    expect(s.answers[1]).toMatchObject({ verdict: "correct", delta: 400 }); // no voided list: unchanged
    expect(s.overridden).toEqual(["a1"]);
    expect(s.lastOverride).toMatchObject({ userId: "b", delta: 400 });
    expect(s.scores).toEqual({ a: 400, b: 400 });
    // The next clue starts clean.
    s = reduceRoom(s, { type: "phase_changed", roomId: "r", seq: 3, phase: "board" });
    expect(s.answers).toEqual([]);
    expect(s.overridden).toEqual([]);
    expect(s.lastOverride).toBeUndefined();
  });

  test("the review pauses the clock until it closes", () => {
    let s: RoomState = { ...playing, deadlineAt: 100 };
    s = reduceRoom(s, { type: "override_review_changed", roomId: "r", seq: 1, open: true, userIds: ["b"] });
    expect(s.review).toEqual({ open: true, userIds: ["b"] });
    expect(s.deadlineAt).toBeUndefined();
    s = reduceRoom(s, {
      type: "override_review_changed",
      roomId: "r",
      seq: 2,
      open: false,
      userIds: ["b"],
      deadlineAt: 900,
    });
    expect(s.review?.open).toBe(false);
    expect(s.deadlineAt).toBe(900);
  });

  test("game_over carries the game's times; a rematch snapshot clears the old game", () => {
    let s = reduceRoom(playing, {
      type: "game_over",
      roomId: "r",
      seq: 1,
      results: [{ userId: "a", displayName: "Alice", score: 400, placement: 1 }],
      startedAt: 1000,
      finishedAt: 5000,
    });
    s = { ...s, phase: "finished" };
    expect(s.startedAt).toBe(1000);
    expect(s.finishedAt).toBe(5000);
    s = reduceRoom(s, {
      type: "room_snapshot",
      roomId: "r",
      seq: 2,
      phase: "lobby",
      round: "single",
      players,
      board: [],
    });
    expect(s.results).toBeUndefined();
    expect(s.rematch).toBe(true);
    expect(s.phase).toBe("lobby");
  });

  test("a pause says why, and a resume clears it", () => {
    let s = reduceRoom(playing, { type: "game_paused", roomId: "r", seq: 1, paused: true, reason: "host_sound" });
    expect(s.paused).toBe(true);
    expect(s.pauseReason).toBe("host_sound");
    s = reduceRoom(s, { type: "game_paused", roomId: "r", seq: 2, paused: true, reason: "host_away" });
    expect(s.pauseReason).toBe("host_away");
    s = reduceRoom(s, { type: "game_paused", roomId: "r", seq: 3, paused: false });
    expect(s.paused).toBe(false);
    expect(s.pauseReason).toBeUndefined();
    s = reduceRoom(initialRoom, {
      type: "room_snapshot",
      roomId: "r",
      seq: 4,
      phase: "board",
      round: "single",
      players,
      board: [],
      paused: true,
      pauseReason: "host_sound",
    });
    expect(s.pauseReason).toBe("host_sound");
  });

  test("a rematch snapshot resets every score to $0 at once", () => {
    let s = reduceRoom(initialRoom, {
      type: "room_snapshot",
      roomId: "r",
      seq: 1,
      phase: "finished",
      round: "final",
      players,
      board: [],
      scores: { a: 1200, b: -400 },
    });
    expect(s.scores).toEqual({ a: 1200, b: -400 });
    s = reduceRoom(s, {
      type: "room_snapshot",
      roomId: "r",
      seq: 2,
      phase: "lobby",
      round: "single",
      players,
      board: [],
    });
    expect(s.scores).toEqual({});
    expect(s.scores.a ?? 0).toBe(0);
  });

  test("a reconnect on the final scoreboard rebuilds the results from the scores", () => {
    const s = reduceRoom(initialRoom, {
      type: "room_snapshot",
      roomId: "r",
      seq: 9,
      phase: "finished",
      round: "final",
      players,
      board: [],
      scores: { a: 800, b: 800 },
    });
    expect(s.results?.map((r) => r.placement)).toEqual([1, 1]);
  });
});

test("the pick reveal comes only with the pick's phase_changed", () => {
  const board = [{ ...clue, state: "unplayed" as const }];
  let s = reduceRoom(
    { ...initialRoom, connection: "open", board },
    { type: "phase_changed", roomId: ROOM, seq: 1, phase: "clue_reading", activeClue: clue, revealUntil: 1500 },
  );
  expect(s.reveal).toEqual({ clueId: "c1", kind: "card" });
  s = reduceRoom(s, { type: "phase_changed", roomId: ROOM, seq: 2, phase: "buzzing_open", activeClue: clue });
  expect(s.reveal).toBeUndefined();
  s = reduceRoom(s, {
    type: "phase_changed",
    roomId: ROOM,
    seq: 3,
    phase: "daily_double_wager",
    activeClue: { ...clue, clueId: "dd" },
    revealUntil: 600,
  });
  expect(s.reveal).toEqual({ clueId: "dd", kind: "blink" });
});

test("another device took the seat: the room stops here", () => {
  const s = reduceRoom({ ...initialRoom, connection: "open" }, { type: "replaced" });
  expect(s.connection).toBe("closed");
  expect(s.replaced).toBe(true);
});

test("a resume lobby's players come with the lobby", () => {
  const resume = {
    gameId: "g",
    startedAt: 1,
    players: [{ userId: "a", displayName: "Alice", score: 1200, back: true }],
  };
  const s = reduceRoom(initialRoom, {
    type: "lobby_updated",
    roomId: ROOM,
    seq: 1,
    hostUserId: "h",
    hostDisplayName: "Wyatt",
    hostPlays: false,
    maxPlayers: 6,
    players: [],
    resume,
  });
  expect(s.resume).toEqual(resume);
});
