import { MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { VOICE_SAMPLE } from "../game/NarratorVoicePicker";
import { DEFAULT_OPTIONS, type GameOptions } from "../lib/gameOptions";
import { narrate, stopNarration } from "../lib/narrator";
import { getSavedVoice, piperChoiceValue, saveVoice } from "../lib/narratorVoice";
import { prepareVoice } from "../lib/piper/engine";
import { markDeviceUnavailable, resetVoicesForTest, setVoiceStatus } from "../lib/piper/voices";
import { initialRoom, type Player, type RoomState } from "../lib/room";
import { requestAnswerPermissions } from "../lib/speech";
import { HostLobbyView } from "./HostLobby";

// The Schmegettes voices download from the network; tests drive their status by hand.
vi.mock("../lib/piper/engine", () => ({ prepareVoice: vi.fn(async () => false), readyEngine: vi.fn(() => null) }));
vi.mock("../lib/speech", async (original) => ({
  ...(await original<typeof import("../lib/speech")>()),
  micPermission: vi.fn(async () => "ask"),
  recognitionSupported: vi.fn(() => true),
  requestAnswerPermissions: vi.fn(),
}));
vi.mock("../lib/narrator", () => ({ narrate: vi.fn(async () => "ended"), stopNarration: vi.fn() }));

// Every lobby test starts with the default voice ready, as on a device that has used it before.
beforeEach(() => {
  resetVoicesForTest();
  vi.mocked(prepareVoice).mockReset().mockResolvedValue(false);
  vi.mocked(narrate).mockClear();
  vi.mocked(stopNarration).mockClear();
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      resume = async () => undefined;
    },
  );
  setVoiceStatus("norman", { state: "ready" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

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
        <HostLobbyView code="K7RXM" joinAddress="example.test/join" state={state} send={send} />
      </MemoryRouter>
    </MantineProvider>,
  );
  return send;
}

/** The player list starts folded into a tab; this opens it. */
const openPlayers = () => fireEvent.click(screen.getByRole("button", { name: /^Show players/ }));

test("shows the code, join URL, host name, and an empty list", () => {
  renderView(lobby());
  expect(screen.getByLabelText("Room code")).toHaveTextContent("K7RXM");
  expect(screen.getByText("Join at example.test/join")).toBeInTheDocument();
  expect(screen.getByText("Hosted by Wyatt")).toBeInTheDocument();
  openPlayers();
  expect(screen.getByText("Waiting for players…")).toBeInTheDocument();
  expect(screen.getByText("Players 0 / 6")).toBeInTheDocument();
});

test("the player list opens folded into a tab with the count; it opens and folds again", () => {
  renderView(lobby({ players: [player("a", "Alice"), player("b", "Bob")] }));
  const tab = screen.getByRole("button", { name: "Show players (2 of 6)" });
  expect(tab).toHaveAttribute("aria-expanded", "false");
  expect(tab).toHaveTextContent("2/6");
  expect(screen.queryByLabelText("Alice")).toBeNull();
  fireEvent.click(tab);
  expect(screen.getByLabelText("Alice")).toBeInTheDocument();
  const header = screen.getByRole("button", { name: "Hide players" });
  expect(header).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(header);
  expect(screen.queryByLabelText("Alice")).toBeNull();
  expect(screen.getByRole("button", { name: "Show players (2 of 6)" })).toBeInTheDocument();
});

test("a join while folded updates the tab's count and flashes it", () => {
  vi.useFakeTimers();
  const view = (state: RoomState) => (
    <MantineProvider>
      <MemoryRouter>
        <HostLobbyView code="K7RXM" joinAddress="example.test/join" state={state} send={vi.fn()} />
      </MemoryRouter>
    </MantineProvider>
  );
  const { rerender } = render(view(lobby({ players: [player("a", "Alice")] })));
  const background = () => screen.getByRole("button", { name: /^Show players/ }).style.background;
  const resting = background();
  rerender(view(lobby({ players: [player("a", "Alice"), player("b", "Bob")] })));
  expect(screen.getByRole("button", { name: "Show players (2 of 6)" })).toBeInTheDocument();
  expect(background()).not.toBe(resting);
  act(() => vi.advanceTimersByTime(600));
  expect(background()).toBe(resting);
  // A leave changes the count without a flash.
  rerender(view(lobby({ players: [player("a", "Alice")] })));
  expect(screen.getByRole("button", { name: "Show players (1 of 6)" })).toBeInTheDocument();
  expect(background()).toBe(resting);
  vi.useRealTimers();
});

test("Start needs 1 player, with no hint text", () => {
  renderView(lobby());
  expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  expect(screen.queryByText(/Need at least/)).toBeNull();
});

test("Start with 1 player", () => {
  const send = renderView(lobby({ players: [player("a", "Alice")] }));
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(send).toHaveBeenCalledWith({ type: "start_game" });
});

test("Start with 2 players, counting a playing host", () => {
  const send = renderView(
    lobby({ hostPlays: true, players: [player("host", "Wyatt", { role: "host" }), player("a", "Alice")] }),
  );
  openPlayers();
  expect(screen.getByText("Players 2 / 6")).toBeInTheDocument();
  expect(screen.getByLabelText("Wyatt, host")).toHaveTextContent("HOST");
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(send).toHaveBeenCalledWith({ type: "start_game" });
});

test("no host buzzer in the lobby, even after the host joins (it appears at Start)", () => {
  renderView(lobby());
  expect(screen.queryByRole("button", { name: "Buzz" })).not.toBeInTheDocument();
  cleanup();
  renderView(lobby({ hostPlays: true, players: [player("host", "Wyatt", { role: "host" })] }));
  expect(screen.queryByRole("button", { name: "Buzz" })).not.toBeInTheDocument();
  openPlayers();
  expect(screen.queryByRole("button", { name: "Buzz" })).not.toBeInTheDocument();
});

test("Join asks for the microphone first, then joins", async () => {
  vi.mocked(requestAnswerPermissions).mockResolvedValue("granted");
  const send = renderView(lobby());
  fireEvent.click(screen.getByRole("button", { name: "Join" }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "set_host_plays", plays: true }));
});

test("a host who blocks the microphone stays a non-playing host; Cancel joins nothing", async () => {
  vi.mocked(requestAnswerPermissions).mockResolvedValue("denied");
  const send = renderView(lobby());
  fireEvent.click(screen.getByRole("button", { name: "Join" }));
  fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" }));
  expect(await screen.findByText("Your microphone is blocked.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(send).not.toHaveBeenCalled();
});

test("Leave while playing", () => {
  const send = renderView(lobby({ hostPlays: true, players: [player("host", "Wyatt", { role: "host" })] }));
  fireEvent.click(screen.getByRole("button", { name: "Leave" }));
  expect(send).toHaveBeenCalledWith({ type: "set_host_plays", plays: false });
});

test("Join is disabled when the room is full", () => {
  renderView(lobby({ maxPlayers: 2, players: [player("a", "Alice"), player("b", "Bob")] }));
  expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
  expect(screen.getByText("Room is full")).toBeInTheDocument();
});

test("a disconnected player is dimmed and still counted", () => {
  renderView(lobby({ players: [player("a", "Alice"), player("b", "Bob", { connected: false })] }));
  openPlayers();
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
        <HostLobbyView code="K7RXM" joinAddress="x" state={lobby({ phase: "building_board" })} send={vi.fn()} />
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

test("the host device (on the TV) never shows sign-in", () => {
  renderView(lobby());
  expect(screen.queryByText(/sign in/i)).toBeNull();
  expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
});

describe("narrator voice", () => {
  const voiceButton = () => screen.getByRole("button", { name: /^Narrator voice:/ });
  const openPicker = () => {
    fireEvent.click(voiceButton());
    return screen.getByRole("dialog", { name: "Narrator voice" });
  };
  const rows = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"));
  const label = (b: HTMLElement) => b.textContent?.replace("✓", "");
  const twoPlayers = () => lobby({ players: [player("a", "Alice"), player("b", "Bob")] });

  test("the default is Norman, downloading in the background as soon as the lobby opens", () => {
    resetVoicesForTest();
    renderView(lobby());
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Norman");
    expect(voiceButton()).toHaveTextContent("🔊");
    expect(voiceButton()).not.toHaveTextContent("Norman");
    expect(prepareVoice).toHaveBeenCalledWith("norman");
    act(() => setVoiceStatus("norman", { state: "downloading", fraction: 0.4 }));
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Norman · 40%");
  });

  test("a host who picked Kristin keeps her", () => {
    saveVoice(piperChoiceValue("kristin"));
    renderView(lobby());
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Kristin");
    expect(prepareVoice).toHaveBeenCalledWith("kristin");
  });

  test("the picker lists only the three Schmegettes voices, Norman first", () => {
    renderView(lobby());
    expect(rows(openPicker()).map(label)).toEqual(["Norman", "Kristin", "John"]);
  });

  test("a built-in voice saved earlier is shown as Norman", () => {
    saveVoice("com.apple.voice.premium.en-US.Ava");
    renderView(lobby());
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Norman");
    expect(prepareVoice).toHaveBeenCalledWith("norman");
  });

  test("picking Kristin saves it, downloads it, and plays the sample once it's ready", async () => {
    let ready: (ok: boolean) => void = () => {};
    vi.mocked(prepareVoice).mockReturnValue(new Promise((r) => (ready = r)));
    renderView(lobby());
    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: "Kristin" }));
    expect(getSavedVoice()).toBe(piperChoiceValue("kristin"));
    expect(prepareVoice).toHaveBeenLastCalledWith("kristin");
    expect(narrate).not.toHaveBeenCalled();
    await act(async () => ready(true));
    expect(narrate).toHaveBeenLastCalledWith(VOICE_SAMPLE);
  });

  test("no sample for a voice the host already moved on from", async () => {
    const pending: Array<{ id: string; ready: (ok: boolean) => void }> = [];
    vi.mocked(prepareVoice).mockImplementation((id) => new Promise((ready) => pending.push({ id, ready })));
    renderView(lobby());
    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: "Kristin" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "John" }));
    // Kristin finishes after John was picked.
    await act(async () => {
      for (const p of pending) if (p.id === "kristin") p.ready(true);
    });
    expect(narrate).not.toHaveBeenCalled();
  });

  test("each voice shows its state; a failed one can be tried again", () => {
    renderView(lobby());
    act(() => {
      setVoiceStatus("norman", { state: "downloading", fraction: 0.4 });
      setVoiceStatus("kristin", { state: "failed" });
      setVoiceStatus("john", { state: "preparing" });
    });
    const dialog = openPicker();
    expect(dialog).toHaveTextContent("Downloading… 40%");
    expect(dialog).toHaveTextContent("Couldn't download");
    expect(dialog).toHaveTextContent("Getting ready…");
    vi.mocked(prepareVoice).mockClear();
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(prepareVoice).toHaveBeenCalledWith("kristin");
  });

  test("Start waits for the voice, showing its progress", () => {
    act(() => setVoiceStatus("norman", { state: "downloading", fraction: 0.4 }));
    renderView(twoPlayers());
    const start = screen.getByRole("button", { name: "Getting Norman ready… 40%" });
    expect(start).toBeDisabled();
    act(() => setVoiceStatus("norman", { state: "preparing" }));
    expect(screen.getByRole("button", { name: "Getting Norman ready…" })).toBeDisabled();
    act(() => setVoiceStatus("norman", { state: "ready" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  test("a failed download keeps Start disabled, with Try again", () => {
    act(() => setVoiceStatus("norman", { state: "failed" }));
    renderView(twoPlayers());
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByText("Couldn't download the voice")).toBeInTheDocument();
    vi.mocked(prepareVoice).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(prepareVoice).toHaveBeenCalledWith("norman");
  });

  test("a device that can't run the voices can't host", () => {
    act(() => markDeviceUnavailable());
    renderView(twoPlayers());
    expect(screen.getByText(/This device can't run the Schmegettes narrator/)).toBeInTheDocument();
    expect(screen.queryByText("Join at example.test/join")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Narrator voice:/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  test("a browser without Web Audio can't host either", () => {
    vi.stubGlobal("AudioContext", undefined);
    renderView(twoPlayers());
    expect(screen.getByText(/This device can't run the Schmegettes narrator/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  test("Start stops a sample that's still playing", () => {
    const send = renderView(twoPlayers());
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(stopNarration).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ type: "start_game" });
  });
});

describe("game options", () => {
  const withOptions = (options: GameOptions) => {
    const onOptions = vi.fn();
    render(
      <MantineProvider>
        <MemoryRouter>
          <HostLobbyView
            code="K7RXM"
            joinAddress="example.test/join"
            state={lobby()}
            send={vi.fn()}
            options={options}
            onOptions={onOptions}
          />
        </MemoryRouter>
      </MantineProvider>,
    );
    return onOptions;
  };

  test("the line under the code lists what isn't the default", () => {
    withOptions({ seasons: [20, 40], doubleRound: false, quickPicks: false, difficulty: "easy" });
    expect(screen.getByLabelText("Game options in use")).toHaveTextContent(
      "Seasons 20–40 · Easy · No Double Schmegettes",
    );
  });

  test("no line with the defaults", () => {
    withOptions(DEFAULT_OPTIONS);
    expect(screen.queryByLabelText("Game options in use")).toBeNull();
  });

  test("the ⚙ icon opens the sheet: no Timers; Double changes at once", () => {
    const onOptions = withOptions(DEFAULT_OPTIONS);
    const button = screen.getByRole("button", { name: "Game options" });
    expect(button).toHaveTextContent("⚙");
    expect(button).not.toHaveTextContent("Options");
    fireEvent.click(button);
    const sheet = screen.getByRole("dialog", { name: "Game options" });
    expect(sheet).not.toHaveTextContent("Timers");
    for (const pace of ["Relaxed", "Standard", "Fast"])
      expect(within(sheet).queryByRole("radio", { name: pace })).toBeNull();
    fireEvent.click(within(sheet).getByRole("switch", { name: /Double Schmegettes/ }));
    expect(onOptions).toHaveBeenLastCalledWith({ ...DEFAULT_OPTIONS, doubleRound: false });
  });

  test("Quick picks: off by default; the switch turns it on; the line under the code says so", () => {
    const onOptions = withOptions(DEFAULT_OPTIONS);
    fireEvent.click(screen.getByRole("button", { name: "Game options" }));
    const sheet = screen.getByRole("dialog", { name: "Game options" });
    const quick = within(sheet).getByRole("switch", { name: /Quick picks/ });
    expect(quick).not.toBeChecked();
    expect(sheet).toHaveTextContent("Say the category and amount");
    fireEvent.click(quick);
    expect(onOptions).toHaveBeenLastCalledWith({ ...DEFAULT_OPTIONS, quickPicks: true });
    cleanup();
    withOptions({ ...DEFAULT_OPTIONS, quickPicks: true });
    expect(screen.getByLabelText("Game options in use")).toHaveTextContent("Quick picks");
  });

  test("Difficulty: Any by default; picking Hard changes it at once", () => {
    const onOptions = withOptions(DEFAULT_OPTIONS);
    fireEvent.click(screen.getByRole("button", { name: "Game options" }));
    const sheet = screen.getByRole("dialog", { name: "Game options" });
    expect(within(sheet).getByRole("radio", { name: "Any" })).toBeChecked();
    fireEvent.click(within(sheet).getByRole("radio", { name: "Hard" }));
    expect(onOptions).toHaveBeenLastCalledWith({ ...DEFAULT_OPTIONS, difficulty: "hard" });
  });
});

test("a resume lobby: the game's players with scores, dimmed until back; Resume", () => {
  const send = renderView(
    lobby({
      players: [player("a", "Alice")],
      resume: {
        gameId: "g",
        startedAt: Date.UTC(2026, 10, 14, 20),
        players: [
          { userId: "a", displayName: "Alice", score: 1200, back: true },
          { userId: "b", displayName: "Bob", score: 400, back: false },
        ],
      },
    }),
  );
  expect(screen.getByRole("button", { name: "Show players (1 of 2)" })).toBeInTheDocument();
  openPlayers();
  expect(screen.getByText("Players 1 / 2")).toBeInTheDocument();
  expect(screen.getByLabelText("Bob, $400, not back yet")).toBeInTheDocument();
  expect(screen.getByText(/Resuming the game from/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Join" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(send).toHaveBeenCalledWith({ type: "start_game" });
});
