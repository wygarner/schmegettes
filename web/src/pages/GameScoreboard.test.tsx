import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { type GameDetail, gameDetail } from "../lib/games";
import { GameScoreboard } from "./GameScoreboard";

vi.mock("../lib/games", () => ({ gameDetail: vi.fn() }));

const detail: GameDetail = {
  gameId: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11",
  status: "finished",
  startedAt: new Date(2026, 9, 26, 20, 14).toISOString(),
  finishedAt: new Date(2026, 9, 26, 20, 55).toISOString(),
  hostDisplayName: "Carol",
  watched: false,
  results: [
    { displayName: "Dana", score: 12400, placement: 1, isCaller: true },
    { displayName: "Bob", score: 8000, placement: 2 },
    { displayName: "Carol", score: 8000, placement: 2 },
    { displayName: "Former player", score: -400, placement: 4 },
  ],
};

function show() {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={[`/games/${detail.gameId}`]}>
        <Routes>
          <Route path="/games/:gameId" element={<GameScoreboard />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => vi.mocked(gameDetail).mockReset());

test("the scoreboard: date and length, host, ties, (you), Former player", async () => {
  vi.mocked(gameDetail).mockResolvedValue({ ok: true, data: detail });
  show();
  const board = await screen.findByLabelText("Scoreboard");
  expect(screen.getByText("Oct 26, 2026 · 8:14 PM · 41 min")).toBeInTheDocument();
  expect(screen.getByText("Hosted by Carol")).toBeInTheDocument();
  expect(board.querySelector("[aria-current]")).toHaveTextContent("Dana (you)");
  expect(board).toHaveTextContent("2ndBob");
  expect(board).toHaveTextContent("2ndCarol");
  expect(board).toHaveTextContent("4thFormer player");
  expect(board).toHaveTextContent("🏆");
});

test("an unfinished game gets no trophy, and a watched one says so", async () => {
  vi.mocked(gameDetail).mockResolvedValue({
    ok: true,
    data: { ...detail, status: "abandoned", watched: true, hostDisplayName: null },
  });
  show();
  expect(await screen.findByText("Unfinished: these are the scores when the room closed.")).toBeInTheDocument();
  expect(screen.getByText("You watched this game.")).toBeInTheDocument();
  expect(screen.queryByText(/Hosted by/)).toBeNull();
  expect(screen.getByLabelText("Scoreboard")).not.toHaveTextContent("🏆");
});

test("a game the player didn't play or watch", async () => {
  vi.mocked(gameDetail).mockResolvedValue({ ok: false, notFound: true });
  show();
  expect(await screen.findByText("This game isn't in your history.")).toBeInTheDocument();
});
