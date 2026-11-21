import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { currentAccount } from "../lib/account";
import { getLeaderboard, getMyStats } from "../lib/stats";
import { Stats } from "./Stats";

vi.mock("../lib/account", async (original) => ({
  ...(await original<typeof import("../lib/account")>()),
  currentAccount: vi.fn(),
}));
vi.mock("../lib/stats", () => ({ getMyStats: vi.fn(), getLeaderboard: vi.fn() }));

function show(path = "/stats") {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/stats" element={<Stats />} />
          <Route path="/stats/leaderboard" element={<Stats />} />
          <Route path="/games/:id" element={<p>scoreboard</p>} />
          <Route path="/join" element={<p>join</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

const stats = {
  games: 12,
  wins: 5,
  winRate: 41,
  averageScore: 6850,
  bestScore: 21400,
  bestGameId: "11111111-1111-4111-8111-111111111111",
  careerTotal: 82200,
  correct: { right: 124, judged: 200 },
  dailyDoubles: { right: 5, wrong: 2 },
  final: { right: 3, wrong: 4 },
  leaderboard: { state: "ranked" as const, rank: 4 },
};

beforeEach(() => {
  vi.mocked(currentAccount).mockReset().mockResolvedValue({ kind: "signed-in", name: "Wyatt" });
  vi.mocked(getMyStats).mockReset().mockResolvedValue({ kind: "ok", data: stats });
  vi.mocked(getLeaderboard).mockReset();
});

test("shows every stats group and links the best score", async () => {
  show();
  expect(await screen.findByText("Leaderboard rank: 4th")).toBeInTheDocument();
  expect(screen.getByText("62% · 124 of 200")).toBeInTheDocument();
  expect(screen.getByText("5–2")).toBeInTheDocument();
  expect(screen.getByText("3–4")).toBeInTheDocument();
  const best = screen.getByRole("link", { name: /\$21,400/ });
  expect(best).toHaveAttribute("href", "/games/11111111-1111-4111-8111-111111111111");
});

test("covers no-games and guest states", async () => {
  vi.mocked(getMyStats).mockResolvedValue({ kind: "ok", data: { ...stats, games: 0 } });
  show();
  expect(await screen.findByText("Play a game to see your stats.")).toBeInTheDocument();
});

test("guest gets the sign-in entry", async () => {
  vi.mocked(currentAccount).mockResolvedValue({ kind: "guest" });
  show();
  expect(await screen.findByText("Sign in to see your stats and the leaderboard.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByLabelText("Email")).toBeInTheDocument();
});

test("leaderboard highlights and pins my row and shows needs-games", async () => {
  vi.mocked(getLeaderboard).mockResolvedValue({
    kind: "ok",
    data: {
      rows: [{ rank: 1, name: "Alice", winRate: 70, wins: 7, games: 10, isMe: false }],
      me: { rank: 63, name: "Wyatt", winRate: 15, wins: 3, games: 20, isMe: true },
      myState: "needs-games",
      gamesToGo: 7,
    },
  });
  show("/stats/leaderboard");
  expect(await screen.findByText("Wyatt (you)")).toBeInTheDocument();
  expect(screen.getByText("Play 7 more games to get on the leaderboard.")).toBeInTheDocument();
});

test("hidden state and retry are shown", async () => {
  vi.mocked(getLeaderboard)
    .mockResolvedValueOnce({ kind: "error" })
    .mockResolvedValueOnce({
      kind: "ok",
      data: { rows: [], me: null, myState: "hidden" },
    });
  show("/stats/leaderboard");
  expect(await screen.findByText("Couldn't load stats. Try again.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Nobody's played 10 games yet. Keep playing.")).toBeInTheDocument();
  expect(screen.getByText("You're hidden from the leaderboard.")).toBeInTheDocument();
});
