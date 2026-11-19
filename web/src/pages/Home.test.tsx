import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { currentAccount } from "../lib/account";
import { markGamePlayed, setSignedOutNotice, shouldShowSavePrompt, signedOutNotice } from "../lib/accountFlags";
import { lastGame } from "../lib/games";
import { getHostAccess, redeemHostCode } from "../lib/hostAccess";
import { type CurrentRoom, createRoom, currentRoom } from "../lib/rooms";
import { Home, normalizeRoomCode } from "./Home";

vi.mock("../lib/rooms", () => ({ createRoom: vi.fn(), currentRoom: vi.fn() }));
vi.mock("../lib/games", () => ({ lastGame: vi.fn() }));
vi.mock("../lib/account", async (original) => ({
  ...(await original<typeof import("../lib/account")>()),
  currentAccount: vi.fn(),
}));
vi.mock("../lib/hostAccess", async (original) => ({
  ...(await original<typeof import("../lib/hostAccess")>()),
  getHostAccess: vi.fn(),
  redeemHostCode: vi.fn(),
}));

function renderHome() {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host/:code" element={<p>host screen</p>} />
          <Route path="/join/:code" element={<p>join screen</p>} />
          <Route path="/account" element={<p>account screen</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.mocked(createRoom).mockReset();
  vi.mocked(getHostAccess).mockReset().mockResolvedValue(true);
  vi.mocked(redeemHostCode).mockReset();
  vi.mocked(currentAccount).mockReset().mockResolvedValue({ kind: "guest" });
  vi.mocked(lastGame).mockReset().mockResolvedValue(null);
  vi.mocked(currentRoom).mockReset().mockResolvedValue(null);
  window.localStorage.clear();
});

test("a guest sees Sign in; a signed-in player sees their initial, linking to Account", async () => {
  renderHome();
  fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
  expect(await screen.findByLabelText("Email")).toBeInTheDocument();
  cleanup();

  vi.mocked(currentAccount).mockResolvedValue({ kind: "signed-in", name: "wyatt" });
  renderHome();
  const chip = await screen.findByRole("link", { name: "Account" });
  expect(chip).toHaveTextContent("W");
  fireEvent.click(chip);
  expect(screen.getByText("account screen")).toBeInTheDocument();
});

test("after a finished game a guest is offered to save it; Not now hides it", async () => {
  markGamePlayed();
  renderHome();
  expect(await screen.findByText("Save your games")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(shouldShowSavePrompt()).toBe(false);
});

test("a signed-in player is never offered to save", async () => {
  markGamePlayed();
  vi.mocked(currentAccount).mockResolvedValue({ kind: "signed-in", name: "W" });
  renderHome();
  await screen.findByRole("link", { name: "Account" });
  expect(screen.queryByText("Save your games")).toBeNull();
});

test("a device that was signed out says so until dismissed", async () => {
  setSignedOutNotice(true);
  renderHome();
  expect(screen.getByText("You've been signed out")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText("You've been signed out")).toBeNull();
  expect(signedOutNotice()).toBe(false);
});

test("a guest asked for a host code can sign in first", async () => {
  vi.mocked(getHostAccess).mockResolvedValue(false);
  renderHome();
  await screen.findByRole("button", { name: "Sign in" });
  fireEvent.click(screen.getByRole("button", { name: "Host a game" }));
  expect(await screen.findByText("Sign in first so you can host from any device.")).toBeInTheDocument();
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

test("a device without host access enters its host code before the name", async () => {
  vi.mocked(getHostAccess).mockResolvedValue(false);
  vi.mocked(redeemHostCode).mockResolvedValue({ kind: "ok" });
  renderHome();
  fireEvent.click(screen.getByRole("button", { name: "Host a game" }));
  fireEvent.change(await screen.findByLabelText("Host code"), { target: { value: "k7rxm2pq" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
  expect(redeemHostCode).toHaveBeenCalledWith("K7RX-M2PQ");
});

test("a host whose access was removed is asked for a code after Create room", async () => {
  vi.mocked(createRoom).mockResolvedValue({ ok: false, problem: "not-a-host" });
  renderHome();
  fireEvent.click(screen.getByRole("button", { name: "Host a game" }));
  fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Ann" } });
  fireEvent.click(screen.getByRole("button", { name: "Create room" }));
  expect(await screen.findByLabelText("Host code")).toBeInTheDocument();
  expect(screen.queryByText("Couldn't create a room. Try again.")).not.toBeInTheDocument();
});

test("when host access can't be checked, Home says so", async () => {
  vi.mocked(getHostAccess).mockResolvedValue(null);
  renderHome();
  fireEvent.click(screen.getByRole("button", { name: "Host a game" }));
  expect(await screen.findByText("Couldn't create a room. Try again.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Host code")).not.toBeInTheDocument();
});

test("links to My games, with the last game under it", async () => {
  renderHome();
  const link = screen.getByRole("link", { name: "My games" });
  expect(link).toHaveAttribute("href", "/games");
  expect(link).toHaveTextContent("Games you've played and watched");
  cleanup();

  vi.mocked(lastGame).mockResolvedValue({
    gameId: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11",
    status: "finished",
    startedAt: "2026-10-26T20:14:00Z",
    finishedAt: "2026-10-26T20:55:00Z",
    score: -400,
    placement: 4,
    players: ["Dana", "Bob"],
    playerCount: 2,
    callerDisplayName: "Dana",
    watched: false,
  });
  renderHome();
  expect(await screen.findByText(/Last: .* · 4th ·/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "My games" })).toHaveTextContent("−$400");
});

describe("rejoin from Home", () => {
  const game: CurrentRoom = {
    kind: "game",
    roomId: "r1",
    code: "K7RXM",
    role: "contestant",
    hostDisplayName: "Wyatt",
    playerNames: ["Alice", "Bob"],
  };

  test("a game in progress: Rejoin takes the player back to their seat", async () => {
    vi.mocked(currentRoom).mockResolvedValue(game);
    renderHome();
    expect(await screen.findByText("Game in progress · K7RXM")).toBeInTheDocument();
    expect(screen.getByText("Alice, Bob")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rejoin" }));
    expect(await screen.findByText("join screen")).toBeInTheDocument();
  });

  test("the host goes back to the TV view", async () => {
    vi.mocked(currentRoom).mockResolvedValue({ ...game, role: "host" });
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Rejoin" }));
    expect(await screen.findByText("host screen")).toBeInTheDocument();
  });

  test("a resume invite says who is resuming, and Join", async () => {
    vi.mocked(currentRoom).mockResolvedValue({ ...game, kind: "resume_invite", code: "M4QTP" });
    renderHome();
    expect(await screen.findByText("Wyatt is resuming your game · M4QTP")).toBeInTheDocument();
    // The card's Join comes first; the other is Home's code field.
    const [cardJoin] = screen.getAllByRole("button", { name: "Join" });
    if (cardJoin) fireEvent.click(cardJoin);
    expect(await screen.findByText("join screen")).toBeInTheDocument();
  });

  test("a game that ended meanwhile says so", async () => {
    vi.mocked(currentRoom).mockResolvedValueOnce(game).mockResolvedValue(null);
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Rejoin" }));
    expect(await screen.findByText("That game has ended.")).toBeInTheDocument();
    expect(screen.queryByText("Game in progress · K7RXM")).toBeNull();
  });

  test("no card when the account is in no room", async () => {
    renderHome();
    await screen.findByRole("button", { name: "Host a game" });
    expect(screen.queryByRole("button", { name: "Rejoin" })).toBeNull();
  });
});
