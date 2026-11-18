import { MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { VOICE_SAMPLE, VOICE_TIPS } from "../game/NarratorVoicePicker";
import { getSavedVoice, piperChoiceValue, saveVoice, type Voice } from "../lib/narratorVoice";
import { prepareVoice } from "../lib/piper/engine";
import { markDeviceUnavailable, resetVoicesForTest, setVoiceStatus } from "../lib/piper/voices";
import { initialRoom, type Player, type RoomState } from "../lib/room";
import { HostLobbyView } from "./HostLobby";

// The Schmegettes voices download from the network; tests drive their status by hand.
vi.mock("../lib/piper/engine", () => ({ prepareVoice: vi.fn(async () => false), readyEngine: vi.fn(() => null) }));

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

test("the host device (on the TV) never shows sign-in", () => {
  renderView(lobby());
  expect(screen.queryByText(/sign in/i)).toBeNull();
  expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
});

describe("narrator voice", () => {
  class FakeUtterance {
    voice: Voice | null = null;
    lang = "";
    rate = 1;
    volume = 1;
    onstart?: () => void;
    onboundary?: () => void;
    onend?: () => void;
    onerror?: () => void;
    constructor(public text: string) {}
  }
  class FakeSynth extends EventTarget {
    voices: Voice[] = [];
    spoken: FakeUtterance[] = [];
    speaking = false;
    pending = false;
    cancel = vi.fn(() => {
      this.speaking = false;
    });
    getVoices() {
      return this.voices;
    }
    speak(u: FakeUtterance) {
      this.spoken.push(u);
      this.speaking = true;
    }
  }

  const v = (name: string, lang: string, quality = "compact", isDefault = false): Voice => ({
    name,
    lang,
    voiceURI: `com.apple.voice.${quality}.${lang}.${name}`,
    default: isDefault,
  });
  const ava = v("Ava", "en-US", "premium");
  const samantha = v("Samantha", "en-US", "compact", true);
  const daniel = v("Daniel", "en-GB");
  const bells = v("Bells", "en-US");
  const thomas = v("Thomas", "fr-FR");

  let synth: FakeSynth;
  beforeEach(() => {
    resetVoicesForTest();
    vi.mocked(prepareVoice).mockReset().mockResolvedValue(false);
    synth = new FakeSynth();
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "speechSynthesis");
    window.localStorage.clear();
  });

  const asIPhone = () =>
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)");
  const voiceButton = () => screen.getByRole("button", { name: /^Narrator voice:/ });
  const openPicker = () => {
    fireEvent.click(voiceButton());
    return screen.getByRole("dialog", { name: "Narrator voice" });
  };
  const rows = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"));

  /** Makes the Schmegettes voice unusable, so the built-in voices (and the tip) apply. */
  const piperBlocked = () => setVoiceStatus("kristin", { state: "failed" });
  const label = (b: HTMLElement) => b.textContent?.replace("✓", "");

  test("hidden when the device can't speak", () => {
    Reflect.deleteProperty(window, "speechSynthesis");
    renderView(lobby());
    expect(screen.queryByRole("button", { name: /^Narrator voice:/ })).toBeNull();
  });

  test("the default is Kristin, downloading in the background as soon as the lobby opens", () => {
    renderView(lobby());
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Kristin");
    expect(prepareVoice).toHaveBeenCalledWith("kristin");
    act(() => setVoiceStatus("kristin", { state: "downloading", fraction: 0.4 }));
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Kristin · 40%");
  });

  test("a built-in voice saved earlier shows its name, or Default voice until the list loads", () => {
    saveVoice(samantha.voiceURI);
    renderView(lobby());
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Default voice");
    expect(prepareVoice).not.toHaveBeenCalled();
    synth.voices = [samantha, ava];
    act(() => {
      synth.dispatchEvent(new Event("voiceschanged"));
    });
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Samantha");
  });

  test("the picker lists the Schmegettes voices, then English device voices best first", () => {
    synth.voices = [thomas, daniel, bells, samantha, ava];
    renderView(lobby());
    const dialog = openPicker();
    expect(dialog).toHaveTextContent("Schmegettes voices");
    expect(dialog).toHaveTextContent("Voices on this device");
    const list = rows(dialog);
    expect(list.map(label)).toEqual(["Kristin", "Norman", "John", "Ava (Premium)", "Samantha", "Daniel (UK)"]);
    expect(list[0]).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(dialog).getByRole("button", { name: "Daniel (UK)" }));
    expect(getSavedVoice()).toBe(daniel.voiceURI);
    expect(synth.spoken.at(-1)?.text).toBe(VOICE_SAMPLE);
    expect(synth.spoken.at(-1)?.voice).toBe(daniel);
    expect(within(dialog).getByRole("button", { name: "Daniel (UK)" })).toHaveAttribute("aria-pressed", "true");
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Daniel (UK)");

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("picking Norman saves it, downloads it, and plays the sample once it's ready", async () => {
    let ready: (ok: boolean) => void = () => {};
    vi.mocked(prepareVoice).mockReturnValue(new Promise((r) => (ready = r)));
    renderView(lobby());
    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: "Norman" }));
    expect(getSavedVoice()).toBe(piperChoiceValue("norman"));
    expect(prepareVoice).toHaveBeenLastCalledWith("norman");
    expect(synth.spoken).toHaveLength(0);
    await act(async () => ready(true));
    expect(synth.spoken.at(-1)?.text).toBe(VOICE_SAMPLE);
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
    expect(synth.spoken).toHaveLength(0);
  });

  test("each Schmegettes voice shows its state; a failed one can be tried again", () => {
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

  test("a device too slow for the Schmegettes voices can't pick them, and falls back to the best built-in voice", () => {
    synth.voices = [samantha, ava];
    renderView(lobby());
    act(() => markDeviceUnavailable());
    const dialog = openPicker();
    expect(within(dialog).getAllByText("Not available on this device")).toHaveLength(3);
    expect(within(dialog).getByRole("button", { name: "Norman" })).toBeDisabled();
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Ava (Premium)");
  });

  test("the download tip shows on Apple devices when the Schmegettes voice can't be used and only standard voices are installed", () => {
    asIPhone();
    piperBlocked();
    synth.voices = [samantha, daniel];
    renderView(lobby());
    expect(openPicker()).toHaveTextContent(VOICE_TIPS.ios);
  });

  test("no tip while the Schmegettes voice works", () => {
    asIPhone();
    synth.voices = [samantha, daniel];
    renderView(lobby());
    expect(openPicker()).not.toHaveTextContent("Want a more natural voice?");
  });

  test("no tip when a Premium voice is installed", () => {
    asIPhone();
    piperBlocked();
    synth.voices = [samantha, ava];
    renderView(lobby());
    expect(openPicker()).not.toHaveTextContent("Want a more natural voice?");
  });

  test("no tip on other devices", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    piperBlocked();
    synth.voices = [samantha];
    renderView(lobby());
    expect(openPicker()).not.toHaveTextContent("Want a more natural voice?");
  });

  test("a device with no English voice says so", () => {
    asIPhone();
    piperBlocked();
    synth.voices = [thomas];
    renderView(lobby());
    const dialog = openPicker();
    expect(dialog).toHaveTextContent("No English voices on this device.");
    expect(dialog).toHaveTextContent(VOICE_TIPS.ios);
  });

  test("Start stops a sample that's still playing", () => {
    synth.voices = [samantha, ava];
    const send = renderView(lobby({ players: [player("a", "Alice"), player("b", "Bob")] }));
    fireEvent.click(within(openPicker()).getByRole("button", { name: "Samantha" }));
    expect(synth.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(synth.cancel).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ type: "start_game" });
  });
});
