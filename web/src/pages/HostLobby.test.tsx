import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { initialRoom, type Player, type RoomState } from "../lib/room";
import { HostLobbyView } from "./HostLobby";

const player = (userId: string, displayName: string, extra: Partial<Player> = {}): Player => ({
  userId,
  displayName,
  role: "contestant",
  score: 0,
  connected: true,
  ...extra,
});

const lobby = (over: Partial<RoomState> = {}): RoomState => ({
  ...initialRoom,
  connection: "open",
  hostUserId: "host",
  hostDisplayName: "Wyatt",
  maxPlayers: 6,
  ...over,
});

function renderView(state: RoomState) {
  const send = vi.fn();
  render(
    <MantineProvider>
      <MemoryRouter>
        <HostLobbyView code="K7RXM" joinUrl="https://example.test/join" state={state} send={send} />
      </MemoryRouter>
    </MantineProvider>,
  );
  return send;
}

test("shows the code, join URL, host name, and an empty list", () => {
  renderView(lobby());
  expect(screen.getByLabelText("Room code")).toHaveTextContent("K7RXM");
  expect(screen.getByText("Join at https://example.test/join")).toBeInTheDocument();
  expect(screen.getByText("Hosted by Wyatt")).toBeInTheDocument();
  expect(screen.getByText("Waiting for players…")).toBeInTheDocument();
  expect(screen.getByText("Players 0 / 6")).toBeInTheDocument();
});

test("Start needs 2 players", () => {
  renderView(lobby({ players: [player("a", "Alice")] }));
  expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  expect(screen.getByText("Need at least 2 players")).toBeInTheDocument();
});

test("Start with 2 players, counting a playing host", () => {
  const send = renderView(
    lobby({ hostPlays: true, players: [player("host", "Wyatt", { role: "host" }), player("a", "Alice")] }),
  );
  expect(screen.getByText("Players 2 / 6")).toBeInTheDocument();
  expect(screen.getByLabelText("Wyatt, host")).toHaveTextContent("HOST");
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(send).toHaveBeenCalledWith({ type: "start_game" });
});

test("the host's buzzer appears once the host joins the game", () => {
  renderView(lobby());
  expect(screen.queryByRole("button", { name: "Buzz" })).not.toBeInTheDocument();
  cleanup();
  renderView(lobby({ hostPlays: true, players: [player("host", "Wyatt", { role: "host" })] }));
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "idle");
});

test("Join the game and Leave the game", () => {
  const send = renderView(lobby());
  fireEvent.click(screen.getByRole("button", { name: "Join the game" }));
  expect(send).toHaveBeenCalledWith({ type: "set_host_plays", plays: true });
});

test("Leave the game while playing", () => {
  const send = renderView(lobby({ hostPlays: true, players: [player("host", "Wyatt", { role: "host" })] }));
  fireEvent.click(screen.getByRole("button", { name: "Leave the game" }));
  expect(send).toHaveBeenCalledWith({ type: "set_host_plays", plays: false });
});

test("Join the game is disabled when the room is full", () => {
  renderView(lobby({ maxPlayers: 2, players: [player("a", "Alice"), player("b", "Bob")] }));
  expect(screen.getByRole("button", { name: "Join the game" })).toBeDisabled();
  expect(screen.getByText("Room is full")).toBeInTheDocument();
});

test("a disconnected player is dimmed and still counted", () => {
  renderView(lobby({ players: [player("a", "Alice"), player("b", "Bob", { connected: false })] }));
  expect(screen.getByText(/\(reconnecting\)/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
});

test("the host renames themself", () => {
  const send = renderView(lobby());
  fireEvent.click(screen.getByRole("button", { name: "Edit your name" }));
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Wy" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(send).toHaveBeenCalledWith({ type: "set_display_name", displayName: "Wy" });
});

test("building the board, server errors, and a closed room", () => {
  const { unmount } = render(
    <MantineProvider>
      <MemoryRouter>
        <HostLobbyView code="K7RXM" joinUrl="x" state={lobby({ phase: "building_board" })} send={vi.fn()} />
      </MemoryRouter>
    </MantineProvider>,
  );
  expect(screen.getByText("Shuffling a fresh board…")).toBeInTheDocument();
  unmount();

  renderView(lobby({ error: { code: "internal", message: "Couldn't build a board. Try again." } }));
  expect(screen.getByText("Couldn't build a board. Try again.")).toBeInTheDocument();
});

test("a closed room says so", () => {
  renderView(lobby({ connection: "closed" }));
  expect(screen.getByText("This room has closed.")).toBeInTheDocument();
});
