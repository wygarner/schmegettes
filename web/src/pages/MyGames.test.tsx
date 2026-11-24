import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { type GameSummary, listGames } from "../lib/games";
import { isAnonymous } from "../lib/supabase";
import { MyGames } from "./MyGames";

vi.mock("../lib/games", () => ({ listGames: vi.fn() }));

const stats = { games: 14, played: 12, wins: 5, best: 12400 };
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
      stats,
    },
  });
  show();
  const list = await screen.findByLabelText("Your games");
  expect(list).toHaveTextContent("You, Bob, Former player");
  expect(list).toHaveTextContent("1st");
  expect(list).toHaveTextContent("$12,400");
  expect(screen.getByText("Unfinished")).toBeInTheDocument();
  expect(within(list).getByText("Watched")).toBeInTheDocument();
  expect(screen.getByText("Played without an account. Sign in to keep them on any phone.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign in to keep them" })).toBeInTheDocument();
  expect(screen.getByText("October 2026")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: /2026|Oct|, / })[0] as HTMLElement);
  expect(screen.getByText("scoreboard")).toBeInTheDocument();
});

test("Show more loads the next page", async () => {
  vi.mocked(listGames)
    .mockResolvedValueOnce({ ok: true, data: { items: [game({})], nextCursor: "abc", stats } })
    .mockResolvedValueOnce({
      ok: true,
      data: {
        items: [game({ gameId: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c99", score: -800 })],
        nextCursor: null,
        stats: null,
      },
    });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
  expect(await screen.findByText("−$800")).toBeInTheDocument();
  expect(listGames).toHaveBeenLastCalledWith("abc");
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
});

test("no games yet", async () => {
  vi.mocked(listGames).mockResolvedValue({
    ok: true,
    data: { items: [], nextCursor: null, stats: { games: 0, played: 0, wins: 0, best: null } },
  });
  show();
  expect(await screen.findByText("No games yet")).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "Watched" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Join a game" }));
  expect(screen.getByText("join")).toBeInTheDocument();
});

test("a failed load offers a retry", async () => {
  vi.mocked(listGames)
    .mockResolvedValueOnce({ ok: false, notFound: false })
    .mockResolvedValueOnce({ ok: true, data: { items: [game({})], nextCursor: null, stats } });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Your games")).toBeInTheDocument();
});

test("stats sum up every game; hidden for a player who only watched", async () => {
  vi.mocked(listGames).mockResolvedValue({ ok: true, data: { items: [game({})], nextCursor: null, stats } });
  show();
  await screen.findByLabelText("Your games");
  expect(screen.getByText("Games").nextElementSibling).toHaveTextContent("14");
  expect(screen.getByText("Wins").nextElementSibling).toHaveTextContent("5");
  expect(screen.getByText("Best").nextElementSibling).toHaveTextContent("$12,400");
  cleanup();

  vi.mocked(listGames).mockResolvedValue({
    ok: true,
    data: {
      items: [game({ watched: true, placement: null })],
      nextCursor: null,
      stats: { games: 1, played: 0, wins: 0, best: null },
    },
  });
  show();
  await screen.findByLabelText("Your games");
  expect(screen.queryByText("Wins")).toBeNull();
});

test("no filter: played and watched games are listed together, and the server gets no kind", async () => {
  vi.mocked(listGames).mockResolvedValue({
    ok: true,
    data: {
      items: [game({}), game({ gameId: "7a1e3b6f-9b1c-4d4a-8b5f-3e2a1c8b0d22", watched: true, placement: null })],
      nextCursor: null,
      stats,
    },
  });
  show();
  const list = await screen.findByLabelText("Your games");
  expect(screen.queryByRole("radiogroup")).toBeNull();
  for (const name of ["All", "Played", "Watched"]) expect(screen.queryByRole("radio", { name })).toBeNull();
  expect(within(list).getByText("Watched")).toBeInTheDocument();
  expect(listGames).toHaveBeenCalledWith();
});
