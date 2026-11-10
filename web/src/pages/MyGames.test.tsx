import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { type GameSummary, listGames } from "../lib/games";
import { isAnonymous } from "../lib/supabase";
import { MyGames } from "./MyGames";

vi.mock("../lib/games", () => ({ listGames: vi.fn() }));
vi.mock("../lib/supabase", () => ({ isAnonymous: vi.fn() }));

const game = (over: Partial<GameSummary>): GameSummary => ({
  gameId: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11",
  status: "finished",
  startedAt: "2026-10-26T20:14:00Z",
  finishedAt: "2026-10-26T20:55:00Z",
  score: 12400,
  placement: 1,
  players: ["Dana", "Bob", "Former player"],
  playerCount: 3,
  callerDisplayName: "Dana",
  watched: false,
  ...over,
});

function show() {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/games"]}>
        <Routes>
          <Route path="/games" element={<MyGames />} />
          <Route path="/games/:gameId" element={<p>scoreboard</p>} />
          <Route path="/join" element={<p>join</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.mocked(listGames).mockReset();
  vi.mocked(isAnonymous).mockResolvedValue(true);
});

test("rows: placement, You, Unfinished, watched games, and the account nudge", async () => {
  vi.mocked(listGames).mockResolvedValue({
    ok: true,
    data: {
      items: [
        game({}),
        game({ gameId: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c12", status: "abandoned", placement: 2, score: 3200 }),
        game({
          gameId: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c13",
          watched: true,
          placement: null,
          callerDisplayName: null,
          score: 0,
          players: ["Eun-ji", "Farah"],
        }),
      ],
      nextCursor: null,
    },
  });
  show();
  const list = await screen.findByLabelText("Your games");
  expect(list).toHaveTextContent("You, Bob, Former player");
  expect(list).toHaveTextContent("1st");
  expect(list).toHaveTextContent("$12,400");
  expect(screen.getByText("Unfinished")).toBeInTheDocument();
  expect(screen.getByText("WATCHED")).toBeInTheDocument();
  expect(
    screen.getByText("Played without an account. Link Google or email to keep these if you switch phones."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: /2026|Oct|, / })[0] as HTMLElement);
  expect(screen.getByText("scoreboard")).toBeInTheDocument();
});

test("Show more loads the next page", async () => {
  vi.mocked(listGames)
    .mockResolvedValueOnce({ ok: true, data: { items: [game({})], nextCursor: "abc" } })
    .mockResolvedValueOnce({
      ok: true,
      data: { items: [game({ gameId: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c99", score: -800 })], nextCursor: null },
    });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
  expect(await screen.findByText("−$800")).toBeInTheDocument();
  expect(listGames).toHaveBeenLastCalledWith("abc");
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
});

test("no games yet", async () => {
  vi.mocked(listGames).mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  show();
  expect(await screen.findByText("No games yet")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Join a game" }));
  expect(screen.getByText("join")).toBeInTheDocument();
});

test("a failed load offers a retry", async () => {
  vi.mocked(listGames)
    .mockResolvedValueOnce({ ok: false, notFound: false })
    .mockResolvedValueOnce({ ok: true, data: { items: [game({})], nextCursor: null } });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Your games")).toBeInTheDocument();
});
