import { afterEach, expect, test, vi } from "vitest";
import { CLOSE_OTHER_DEVICE, GameSocket } from "./gameSocket";

vi.mock("./supabase", () => ({ getAccessToken: vi.fn().mockResolvedValue("token") }));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage?: (e: { data: string }) => void;
  onclose?: (e: { code: number }) => void;
  constructor(
    public url: string,
    public protocols: string[],
  ) {
    FakeWebSocket.instances.push(this);
  }
  send() {}
  close() {}
  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
});

const ROOM = "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11";

test("a room_closed after reconnecting is delivered, not treated as a gap", async () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const socket = new GameSocket("ws://game/rooms/r/ws");
  const seen: string[] = [];
  socket.subscribe((m) => seen.push(m.type));
  await socket.connect();
  const ws = FakeWebSocket.instances[0];
  ws?.emit({
    type: "room_snapshot",
    roomId: ROOM,
    seq: 7,
    phase: "lobby",
    round: "single",
    players: [],
    board: [],
  });
  ws?.emit({ type: "room_closed", roomId: ROOM, seq: 0, reason: "closed" });

  expect(seen).toEqual(["room_snapshot", "room_closed"]);
  expect(FakeWebSocket.instances).toHaveLength(1); // no reconnect
});

test("a real gap still reconnects", async () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const socket = new GameSocket("ws://game/rooms/r/ws");
  await socket.connect();
  const ws = FakeWebSocket.instances[0];
  ws?.emit({ type: "room_snapshot", roomId: ROOM, seq: 1, phase: "lobby", round: "single", players: [], board: [] });
  ws?.emit({ type: "phase_changed", roomId: ROOM, seq: 5, phase: "lobby" });
  await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
});

test("the drop listener hears the close code (4001: another device took the seat)", async () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const socket = new GameSocket("ws://game/rooms/r/ws");
  const codes: Array<number | undefined> = [];
  socket.onDrop((code) => codes.push(code));
  await socket.connect();
  FakeWebSocket.instances[0]?.onclose?.({ code: CLOSE_OTHER_DEVICE });
  expect(codes).toEqual([CLOSE_OTHER_DEVICE]);
});
