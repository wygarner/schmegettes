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
