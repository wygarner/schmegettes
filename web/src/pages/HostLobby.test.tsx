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
  setVoiceStatus("kristin", { state: "ready" });
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

test("Start needs 1 player", () => {
  renderView(lobby());
  expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  expect(screen.getByText("Need at least 1 player")).toBeInTheDocument();
});

test("Start with 1 player", () => {
  const send = renderView(lobby({ players: [player("a", "Alice")] }));
  expect(screen.queryByText("Need at least 1 player")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(send).toHaveBeenCalledWith({ type: "start_game" });
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

test("Join the game asks for the microphone first, then joins", async () => {
  vi.mocked(requestAnswerPermissions).mockResolvedValue("granted");
  const send = renderView(lobby());
  fireEvent.click(screen.getByRole("button", { name: "Join the game" }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "set_host_plays", plays: true }));
});

test("a host who blocks the microphone stays a non-playing host; Cancel joins nothing", async () => {
  vi.mocked(requestAnswerPermissions).mockResolvedValue("denied");
  const send = renderView(lobby());
  fireEvent.click(screen.getByRole("button", { name: "Join the game" }));
  fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" }));
  expect(await screen.findByText("Your microphone is blocked.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(send).not.toHaveBeenCalled();
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

  test("the default is Kristin, downloading in the background as soon as the lobby opens", () => {
    resetVoicesForTest();
    renderView(lobby());
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Kristin");
    expect(prepareVoice).toHaveBeenCalledWith("kristin");
    act(() => setVoiceStatus("kristin", { state: "downloading", fraction: 0.4 }));
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Kristin · 40%");
  });

  test("the picker lists only the three Schmegettes voices", () => {
    renderView(lobby());
    expect(rows(openPicker()).map(label)).toEqual(["Kristin", "Norman", "John"]);
  });

  test("a built-in voice saved earlier is shown as Kristin", () => {
    saveVoice("com.apple.voice.premium.en-US.Ava");
    renderView(lobby());
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Kristin");
    expect(prepareVoice).toHaveBeenCalledWith("kristin");
  });

  test("picking Norman saves it, downloads it, and plays the sample once it's ready", async () => {
    let ready: (ok: boolean) => void = () => {};
    vi.mocked(prepareVoice).mockReturnValue(new Promise((r) => (ready = r)));
    renderView(lobby());
    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: "Norman" }));
    expect(getSavedVoice()).toBe(piperChoiceValue("norman"));
    expect(prepareVoice).toHaveBeenLastCalledWith("norman");
    expect(narrate).not.toHaveBeenCalled();
    await act(async () => ready(true));
    expect(narrate).toHaveBeenLastCalledWith(VOICE_SAMPLE);
  });

  test("no sample for a voice the host already moved on from", async () => {
    const pending: Array<{ id: string; ready: (ok: boolean) => void }> = [];
    vi.mocked(prepareVoice).mockImplementation((id) => new Promise((ready) => pending.push({ id, ready })));
    renderView(lobby());
    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: "Norman" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "John" }));
    // Norman finishes after John was picked.
    await act(async () => {
      for (const p of pending) if (p.id === "norman") p.ready(true);
    });
    expect(narrate).not.toHaveBeenCalled();
  });

  test("each voice shows its state; a failed one can be tried again", () => {
    renderView(lobby());
    act(() => {
      setVoiceStatus("kristin", { state: "downloading", fraction: 0.4 });
      setVoiceStatus("norman", { state: "failed" });
      setVoiceStatus("john", { state: "preparing" });
    });
    const dialog = openPicker();
    expect(dialog).toHaveTextContent("Downloading… 40%");
    expect(dialog).toHaveTextContent("Couldn't download");
    expect(dialog).toHaveTextContent("Getting ready…");
    vi.mocked(prepareVoice).mockClear();
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(prepareVoice).toHaveBeenCalledWith("norman");
  });

  test("Start waits for the voice, showing its progress", () => {
    act(() => setVoiceStatus("kristin", { state: "downloading", fraction: 0.4 }));
    renderView(twoPlayers());
    const start = screen.getByRole("button", { name: "Getting Kristin ready… 40%" });
    expect(start).toBeDisabled();
    act(() => setVoiceStatus("kristin", { state: "preparing" }));
    expect(screen.getByRole("button", { name: "Getting Kristin ready…" })).toBeDisabled();
    act(() => setVoiceStatus("kristin", { state: "ready" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  test("a failed download keeps Start disabled, with Try again", () => {
    act(() => setVoiceStatus("kristin", { state: "failed" }));
    renderView(twoPlayers());
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByText("Couldn't download the voice")).toBeInTheDocument();
    vi.mocked(prepareVoice).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(prepareVoice).toHaveBeenCalledWith("kristin");
  });

  test("a device that can't run the voices can't host", () => {
    act(() => markDeviceUnavailable());
    renderView(twoPlayers());
    expect(screen.getByText(/This device can't run the Schmegettes narrator/)).toBeInTheDocument();
    expect(screen.queryByText("Join at https://example.test/join")).toBeNull();
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
            joinUrl="https://example.test/join"
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
    withOptions({ seasons: [20, 40], timers: "fast", doubleRound: false });
    expect(screen.getByLabelText("Game options")).toHaveTextContent(
      "Seasons 20–40 · Fast timers · No Double Schmegettes",
    );
  });

  test("no line with the defaults", () => {
    withOptions(DEFAULT_OPTIONS);
    expect(screen.queryByLabelText("Game options")).toBeNull();
  });

  test("Options opens the sheet; timers and Double change at once", () => {
    const onOptions = withOptions(DEFAULT_OPTIONS);
    fireEvent.click(screen.getByRole("button", { name: "⚙ Options" }));
    const sheet = screen.getByRole("dialog", { name: "Game options" });
    expect(sheet).toHaveTextContent("9 s to buzz in, 9 s to answer");
    fireEvent.click(within(sheet).getByText("Fast"));
    expect(onOptions).toHaveBeenLastCalledWith({ ...DEFAULT_OPTIONS, timers: "fast" });
    fireEvent.click(within(sheet).getByRole("switch", { name: /Double Schmegettes/ }));
    expect(onOptions).toHaveBeenLastCalledWith({ ...DEFAULT_OPTIONS, doubleRound: false });
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
  expect(screen.getByText("Players 1 / 2")).toBeInTheDocument();
  expect(screen.getByLabelText("Bob, $400, not back yet")).toBeInTheDocument();
  expect(screen.getByText(/Resuming the game from/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Join the game" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(send).toHaveBeenCalledWith({ type: "start_game" });
});
