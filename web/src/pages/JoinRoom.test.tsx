import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { initialRoom, type RoomState, useRoom } from "../lib/room";
import { joinRoom, type RoomJoin, type RoomProblem, roomByCode } from "../lib/rooms";
import { micPermission, onMicPermissionChange, recognitionSupported, requestAnswerPermissions } from "../lib/speech";
import { JOIN_ERRORS, JoinRoom } from "./JoinRoom";

vi.mock("../lib/rooms", () => ({ joinRoom: vi.fn(), roomByCode: vi.fn() }));
vi.mock("../lib/supabase", () => ({ getUserId: vi.fn().mockResolvedValue("me") }));
// The microphone is allowed already unless a test says otherwise.
vi.mock("../lib/speech", async (original) => ({
  ...(await original<typeof import("../lib/speech")>()),
  micPermission: vi.fn(),
  recognitionSupported: vi.fn(),
  requestAnswerPermissions: vi.fn(),
  onMicPermissionChange: vi.fn(),
}));
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
  vi.mocked(useRoom).mockReset().mockReturnValue({ state: inLobby, send: vi.fn(), leave: vi.fn() });
  vi.mocked(micPermission).mockReset().mockResolvedValue("granted");
  vi.mocked(recognitionSupported).mockReset().mockReturnValue(true);
  vi.mocked(requestAnswerPermissions).mockReset().mockResolvedValue("granted");
  vi.mocked(onMicPermissionChange)
    .mockReset()
    .mockReturnValue(() => {});
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

describe("the microphone comes first", () => {
  test("a new player allows it before the name, and isn't joined before", async () => {
    vi.mocked(micPermission).mockResolvedValue("ask");
    vi.mocked(roomByCode).mockResolvedValue({ ok: false, problem: "room-not-found" });
    renderJoin();
    fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" }));
    expect(await screen.findByLabelText("What's your name?")).toBeInTheDocument();
    expect(requestAnswerPermissions).toHaveBeenCalled();
    expect(joinRoom).not.toHaveBeenCalled();
  });

  test("blocked: the steps and Try again; there's no way past it but Leave", async () => {
    vi.mocked(micPermission).mockResolvedValue("ask");
    vi.mocked(requestAnswerPermissions).mockResolvedValueOnce("denied").mockResolvedValueOnce("granted");
    vi.mocked(roomByCode).mockResolvedValue({ ok: false, problem: "room-not-found" });
    renderJoin();
    fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" }));
    expect(await screen.findByText("Your microphone is blocked.")).toBeInTheDocument();
    expect(screen.queryByLabelText("What's your name?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("What's your name?")).toBeInTheDocument();
  });

  test("already blocked: straight to the steps; Leave goes home", async () => {
    vi.mocked(micPermission).mockResolvedValue("denied");
    vi.mocked(roomByCode).mockResolvedValue({ ok: false, problem: "room-not-found" });
    renderJoin();
    expect(await screen.findByText("Your microphone is blocked.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(await screen.findByText("home")).toBeInTheDocument();
  });

  test("a browser that can't hear answers stops here", async () => {
    vi.mocked(recognitionSupported).mockReturnValue(false);
    vi.mocked(roomByCode).mockResolvedValue({ ok: false, problem: "room-not-found" });
    renderJoin();
    expect(await screen.findByText("This browser can't hear answers.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow microphone" })).toBeNull();
  });

  test("a member who reloads goes through it again when the browser asks again", async () => {
    vi.mocked(micPermission).mockResolvedValue("ask");
    vi.mocked(roomByCode).mockResolvedValue({ ok: true, data: room });
    renderJoin();
    fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" }));
    expect(await screen.findByText("You're in, Alice.")).toBeInTheDocument();
    expect(useRoom).toHaveBeenLastCalledWith(room.gameSocketUrl, "host");
  });

  test("turned off mid-game: the gate covers the game and the socket closes", async () => {
    let change: (s: "granted" | "denied" | "ask") => void = () => {};
    vi.mocked(onMicPermissionChange).mockImplementation((cb) => {
      change = cb;
      return () => {};
    });
    vi.mocked(roomByCode).mockResolvedValue({ ok: true, data: room });
    vi.mocked(micPermission).mockResolvedValueOnce("granted").mockResolvedValue("denied");
    renderJoin();
    expect(await screen.findByText("You're in, Alice.")).toBeInTheDocument();
    act(() => change("denied"));
    expect(await screen.findByText("Your microphone is blocked.")).toBeInTheDocument();
    expect(useRoom).toHaveBeenLastCalledWith(null, "host");
  });
});
