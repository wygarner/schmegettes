import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { createRoom } from "../lib/rooms";
import { Home, normalizeRoomCode } from "./Home";

vi.mock("../lib/rooms", () => ({ createRoom: vi.fn() }));

function renderHome() {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host/:code" element={<p>host screen</p>} />
          <Route path="/join/:code" element={<p>join screen</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.mocked(createRoom).mockReset();
  window.localStorage.clear();
});

test("normalizes room codes to five uppercase characters", () => {
  expect(normalizeRoomCode("ab-c d1x9")).toBe("ABCD1");
});

test("enables Join only for a full code, then opens the join page", () => {
  renderHome();
  const join = screen.getByRole("button", { name: "Join" });
  expect(join).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "abcde" } });
  expect(join).toBeEnabled();
  fireEvent.click(join);
  expect(screen.getByText("join screen")).toBeInTheDocument();
});

test("Host a game asks for a name, prefilled with the last one", async () => {
  window.localStorage.setItem("schmegettes.displayName", "Wyatt");
  renderHome();
  fireEvent.click(screen.getByRole("button", { name: "Host a game" }));
  const input = await screen.findByLabelText("Your name");
  expect(input).toHaveValue("Wyatt");

  fireEvent.change(input, { target: { value: "   " } });
  expect(screen.getByRole("button", { name: "Create room" })).toBeDisabled();
});

test("creating a room opens the host screen", async () => {
  vi.mocked(createRoom).mockResolvedValue({
    ok: true,
    data: {
      gameSocketUrl: "ws://game/rooms/r/ws",
      room: {
        roomId: "r",
        code: "K7RXM",
        status: "open",
        hostUserId: "u",
        hostDisplayName: "Ann",
        hostPlays: false,
        maxPlayers: 6,
        seasons: null,
      },
    },
  });
  renderHome();
  fireEvent.click(screen.getByRole("button", { name: "Host a game" }));
  fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: " Ann " } });
  fireEvent.click(screen.getByRole("button", { name: "Create room" }));

  expect(await screen.findByText("host screen")).toBeInTheDocument();
  expect(createRoom).toHaveBeenCalledOnce();
  expect(createRoom).toHaveBeenCalledWith("Ann");
  expect(window.localStorage.getItem("schmegettes.displayName")).toBe("Ann");
});

test("a failed create returns to Home with a message", async () => {
  vi.mocked(createRoom).mockResolvedValue({ ok: false, problem: "error" });
  renderHome();
  fireEvent.click(screen.getByRole("button", { name: "Host a game" }));
  fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Ann" } });
  fireEvent.click(screen.getByRole("button", { name: "Create room" }));
  expect(await screen.findByText("Couldn't create a room. Try again.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument());
});

test("links to My games", () => {
  renderHome();
  expect(screen.getByRole("link", { name: "My games" })).toHaveAttribute("href", "/games");
});
