import { MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { VOICE_SAMPLE, VOICE_TIPS } from "../game/NarratorVoicePicker";
import { getSavedVoice, type Voice } from "../lib/narratorVoice";
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

  test("hidden when the device can't speak", () => {
    Reflect.deleteProperty(window, "speechSynthesis");
    renderView(lobby());
    expect(screen.queryByRole("button", { name: /^Narrator voice:/ })).toBeNull();
  });

  test("shows the best voice, or Default voice until the list loads", () => {
    renderView(lobby());
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Default voice");
    synth.voices = [samantha, ava];
    act(() => {
      synth.dispatchEvent(new Event("voiceschanged"));
    });
    expect(voiceButton()).toHaveAccessibleName("Narrator voice: Ava (Premium)");
  });

  test("the picker lists English voices best first; a tap saves the voice and says the sample", () => {
    synth.voices = [thomas, daniel, bells, samantha, ava];
    renderView(lobby());
    const dialog = openPicker();
    const list = rows(dialog);
    expect(list.map((b) => b.textContent?.replace("✓", ""))).toEqual(["Ava (Premium)", "Samantha", "Daniel (UK)"]);
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

  test("the download tip shows on Apple devices with only standard voices", () => {
    asIPhone();
    synth.voices = [samantha, daniel];
    renderView(lobby());
    expect(openPicker()).toHaveTextContent(VOICE_TIPS.ios);
  });

  test("no tip when a Premium voice is installed", () => {
    asIPhone();
    synth.voices = [samantha, ava];
    renderView(lobby());
    expect(openPicker()).not.toHaveTextContent("Want a more natural voice?");
  });

  test("no tip on other devices", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    synth.voices = [samantha];
    renderView(lobby());
    expect(openPicker()).not.toHaveTextContent("Want a more natural voice?");
  });

  test("a device with no English voice says so", () => {
    asIPhone();
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
