import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { initialRoom, type RoomState, useRoom } from "../lib/room";
import { joinRoom, type RoomJoin, type RoomProblem, roomByCode } from "../lib/rooms";
import { JOIN_ERRORS, JoinRoom } from "./JoinRoom";

vi.mock("../lib/rooms", () => ({ joinRoom: vi.fn(), roomByCode: vi.fn() }));
vi.mock("../lib/supabase", () => ({ getUserId: vi.fn().mockResolvedValue("me") }));
vi.mock("../lib/room", async (original) => ({
  ...(await original<typeof import("../lib/room")>()),
  useRoom: vi.fn(),
}));

const room: RoomJoin = {
  gameSocketUrl: "ws://game/rooms/r/ws",
  room: {
    roomId: "r",
    code: "K7RXM",
    status: "open",
    hostUserId: "host",
    hostDisplayName: "Wyatt",
    hostPlays: false,
    maxPlayers: 6,
    seasons: null,
    timers: "standard",
    doubleRound: true,
  },
};

const inLobby: RoomState = {
  ...initialRoom,
  connection: "open",
  hostDisplayName: "Wyatt",
  maxPlayers: 6,
  players: [{ userId: "me", displayName: "Alice", role: "contestant", score: 0, connected: true }],
};

beforeEach(() => {
  vi.mocked(joinRoom).mockReset();
  vi.mocked(roomByCode).mockReset();
  vi.mocked(useRoom).mockReturnValue({ state: inLobby, send: vi.fn(), leave: vi.fn() });
  window.localStorage.clear();
});

function renderJoin() {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/join/K7RXM"]}>
        <Routes>
          <Route path="/join/:code" element={<JoinRoom />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

test("a new player enters a name and is in", async () => {
  window.localStorage.setItem("schmegettes.displayName", "Alice");
  vi.mocked(roomByCode).mockResolvedValue({ ok: false, problem: "room-not-found" });
  vi.mocked(joinRoom).mockResolvedValue({ ok: true, data: room });
  renderJoin();

  const input = await screen.findByLabelText("What's your name?");
  expect(input).toHaveValue("Alice");
  fireEvent.click(screen.getByRole("button", { name: "Join" }));

  expect(await screen.findByText("You're in, Alice.")).toBeInTheDocument();
  expect(screen.queryByText(/Look at the TV/)).not.toBeInTheDocument();
  // The buzzer is on screen from the lobby on; a tap there only animates it.
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "idle");
  expect(joinRoom).toHaveBeenCalledWith("K7RXM", "Alice");
});

test("a member who reloads goes straight back in", async () => {
  vi.mocked(roomByCode).mockResolvedValue({ ok: true, data: room });
  renderJoin();
  expect(await screen.findByText("You're in, Alice.")).toBeInTheDocument();
  expect(screen.queryByLabelText("What's your name?")).not.toBeInTheDocument();
  expect(joinRoom).not.toHaveBeenCalled();
});

test.each(["room-not-found", "room-full", "game-started"] as RoomProblem[])("shows %s", async (problem) => {
  vi.mocked(roomByCode).mockResolvedValue({ ok: false, problem: "room-not-found" });
  vi.mocked(joinRoom).mockResolvedValue({ ok: false, problem });
  renderJoin();
  fireEvent.change(await screen.findByLabelText("What's your name?"), { target: { value: "Alice" } });
  fireEvent.click(screen.getByRole("button", { name: "Join" }));
  expect(await screen.findByText(JOIN_ERRORS[problem])).toBeInTheDocument();
});

test("Join is disabled without a name", async () => {
  vi.mocked(roomByCode).mockResolvedValue({ ok: false, problem: "room-not-found" });
  renderJoin();
  fireEvent.change(await screen.findByLabelText("What's your name?"), { target: { value: "  " } });
  expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
});

test("Leave goes home and tells the room", async () => {
  const leave = vi.fn();
  vi.mocked(useRoom).mockReturnValue({ state: inLobby, send: vi.fn(), leave });
  vi.mocked(roomByCode).mockResolvedValue({ ok: true, data: room });
  renderJoin();
  fireEvent.click(await screen.findByRole("button", { name: "Leave" }));
  expect(leave).toHaveBeenCalled();
  expect(await screen.findByText("home")).toBeInTheDocument();
});

test("Edit name sends the new name", async () => {
  const send = vi.fn();
  vi.mocked(useRoom).mockReturnValue({ state: inLobby, send, leave: vi.fn() });
  vi.mocked(roomByCode).mockResolvedValue({ ok: true, data: room });
  renderJoin();
  fireEvent.click(await screen.findByRole("button", { name: "Edit name" }));
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ally" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(send).toHaveBeenCalledWith({ type: "set_display_name", displayName: "Ally" });
});

test("a closed room and a started game", async () => {
  vi.mocked(roomByCode).mockResolvedValue({ ok: true, data: room });
  vi.mocked(useRoom).mockReturnValue({ state: { ...inLobby, phase: "building_board" }, send: vi.fn(), leave: vi.fn() });
  renderJoin();
  expect(await screen.findByText("Shuffling a fresh board…")).toBeInTheDocument();
});
