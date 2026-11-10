import { MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initialRoom, type RoomState } from "../lib/room";
import { type Recognizer, setRecognizerFactory } from "../lib/speech";
import { HostGame } from "./HostGame";

class FakeUtterance {
  onstart?: () => void;
  onend?: () => void;
  onerror?: () => void;
  constructor(public text: string) {}
}

let spoken: FakeUtterance[];
beforeEach(() => {
  spoken = [];
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    // A browser that starts speaking at once. The silent unlock utterance isn't narration.
    value: {
      cancel: vi.fn(),
      speak: (u: FakeUtterance) => {
        u.onstart?.();
        if (u.text.trim()) spoken.push(u);
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const clue = { clueId: "c1", category: "SCIENCE", value: 400, state: "active" as const, clueText: "THIS GAS" };
const state: RoomState = {
  ...initialRoom,
  connection: "open",
  hostUserId: "host",
  players: [{ userId: "a", displayName: "Alice", role: "contestant", score: 0, connected: true }],
  board: [clue],
  phase: "clue_reading",
  activeClue: clue,
  deadlineAt: 123,
};

test("reads the clue aloud once, then reports reading done", async () => {
  const send = vi.fn();
  const { rerender } = render(
    <MantineProvider>
      <HostGame state={state} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  expect(screen.getByLabelText("Clue")).toHaveTextContent("THIS GAS");
  expect(spoken.map((u) => u.text)).toEqual(["Here's SCIENCE for 400. THIS GAS"]);
  rerender(
    <MantineProvider>
      <HostGame state={{ ...state }} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  expect(spoken).toHaveLength(1);
  spoken[0]?.onend?.();
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "reading_done", clueId: "c1" }));
});

test("shows the correct response and the verdict", () => {
  render(
    <MantineProvider>
      <HostGame
        state={{
          ...state,
          phase: "answering",
          lastVerdict: { userId: "a", answer: "nitrogen", verdict: "correct", delta: 400 },
          clueEnd: { state: "answered", correctResponse: "Nitrogen" },
        }}
        send={vi.fn()}
        hostUserId="host"
      />
    </MantineProvider>,
  );
  expect(screen.getByText("Nitrogen")).toBeInTheDocument();
  expect(screen.getByText(/Alice:/)).toBeInTheDocument();
});

test("the host's player bar appears when the host plays", () => {
  render(
    <MantineProvider>
      <HostGame
        state={{
          ...state,
          hostPlays: true,
          phase: "buzzing_open",
          players: [
            ...state.players,
            { userId: "host", displayName: "Wyatt", role: "host", score: 0, connected: true },
          ],
        }}
        send={vi.fn()}
        hostUserId="host"
      />
    </MantineProvider>,
  );
  expect(screen.getByLabelText("Your controls")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Buzz" })).toBeInTheDocument();
});

test("final scores", () => {
  render(
    <MantineProvider>
      <HostGame
        state={{
          ...state,
          phase: "finished",
          results: [
            { userId: "a", displayName: "Alice", score: 1200, placement: 1 },
            { userId: "b", displayName: "Bob", score: -400, placement: 2 },
          ],
        }}
        send={vi.fn()}
        hostUserId="host"
      />
    </MantineProvider>,
  );
  expect(screen.getByText("Final scores")).toBeInTheDocument();
  expect(screen.getByLabelText("2nd Bob −$400")).toBeInTheDocument();
});

test("when the browser blocks speech, buzzing is left to the server timer and the TV asks for a tap", async () => {
  const send = vi.fn();
  render(
    <MantineProvider>
      <HostGame state={state} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  spoken[0]?.onerror?.();
  const tap = await screen.findByRole("button", { name: "Tap to turn on sound" });
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "reading_done" }));

  tap.click();
  const read = "Here's SCIENCE for 400. THIS GAS";
  expect(spoken.map((u) => u.text)).toEqual([read, read]); // read again from the tap
  spoken[1]?.onend?.();
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "reading_done", clueId: "c1" }));
});

test("without speech synthesis, the TV never reports reading done", async () => {
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
  const send = vi.fn();
  render(
    <MantineProvider>
      <HostGame state={state} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  await new Promise((r) => setTimeout(r, 20));
  expect(send).not.toHaveBeenCalled();
});

const board = [{ clueId: "c2", category: "OPERA", value: 200, state: "unplayed" as const }];
const players = [
  { userId: "a", displayName: "Alice", role: "contestant" as const, score: 0, connected: true },
  { userId: "host", displayName: "Wyatt", role: "host" as const, score: 0, connected: true },
];
const onBoard: RoomState = {
  ...state,
  phase: "board",
  activeClue: undefined,
  board,
  players,
  scores: { a: 1200, host: -200 },
  controllingUserId: "a",
};

function host(s: RoomState, send = vi.fn()) {
  render(
    <MantineProvider>
      <HostGame state={s} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  return send;
}

test("the TV board can't be tapped when it isn't the host's pick", () => {
  host({ ...onBoard, hostPlays: false });
  expect(screen.getByRole("button", { name: "OPERA for 200" })).toBeDisabled();
  cleanup();
  host({ ...onBoard, hostPlays: true });
  expect(screen.getByRole("button", { name: "OPERA for 200" })).toBeDisabled();
});

test("a playing host with control taps and confirms", async () => {
  const send = host({ ...onBoard, hostPlays: true, controllingUserId: "host" });
  fireEvent.click(screen.getByRole("button", { name: "OPERA for 200" }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Pick" }));
  expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "c2" });
});

test("no waiting caption; the picker's tile is highlighted", () => {
  host(onBoard);
  expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
  expect(screen.queryByText(/host can tap/)).not.toBeInTheDocument();
  const tile = screen.getByLabelText("Alice $1,200, picking");
  expect(tile).toHaveAttribute("aria-current", "true");
  expect(screen.getByLabelText("Wyatt −$200")).not.toHaveAttribute("aria-current");
});

test("every score stays on screen during a clue and its correct response", () => {
  host({ ...onBoard, phase: "answering", activeClue: clue });
  expect(screen.getByLabelText("Alice $1,200, picking")).toBeInTheDocument();
  cleanup();
  host({
    ...onBoard,
    phase: "answering",
    activeClue: clue,
    clueEnd: { state: "unanswered", correctResponse: "Nitrogen" },
  });
  expect(screen.getByLabelText("Wyatt −$200")).toBeInTheDocument();
});

test("the correct-response screen leaves the clue out", () => {
  host({ ...state, phase: "answering", clueEnd: { state: "answered", correctResponse: "Nitrogen" } });
  expect(screen.queryByLabelText("Clue")).not.toBeInTheDocument();
  expect(screen.queryByText("THIS GAS")).not.toBeInTheDocument();
  expect(screen.getByText("Nitrogen")).toBeInTheDocument();
});

const ddClue = { clueId: "c1", category: "SCIENCE", value: 400, state: "active" as const, dailyDouble: true };

function showHost(s: RoomState, send = vi.fn()) {
  const r = render(
    <MantineProvider>
      <HostGame state={s} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  return {
    send,
    update: (n: RoomState) =>
      r.rerender(
        <MantineProvider>
          <HostGame state={n} send={send} hostUserId="host" />
        </MantineProvider>,
      ),
  };
}

test("a Daily Double: the reveal, the wager, then the clue read with the wager", () => {
  const dd: RoomState = { ...state, phase: "daily_double_wager", activeClue: ddClue, controllingUserId: "a" };
  const { update } = showHost(dd);
  expect(screen.getByText("DAILY DOUBLE")).toBeInTheDocument();
  expect(spoken.map((u) => u.text)).toEqual(["It's a Daily Double."]);
  update({ ...dd, wager: 1000 });
  expect(screen.getByText("Alice wagers $1,000")).toBeInTheDocument();
  update({ ...dd, phase: "clue_reading", wager: 1000, activeClue: { ...ddClue, clueText: "THIS GAS" } });
  expect(spoken.at(-1)?.text).toBe("For 1000, here's the clue. THIS GAS");
  expect(screen.getByText(/DD \$1,000/)).toBeInTheDocument();
});

const finalState: RoomState = {
  ...state,
  phase: "final_category",
  round: "final",
  activeClue: { clueId: "f", category: "ISLANDS", value: 0, state: "unplayed" },
  finalistUserIds: ["a"],
  deadlineAt: 456,
};

test("Final: the category is announced and reported; the clue is read once", async () => {
  const { send, update } = showHost(finalState);
  expect(screen.getByText("FINAL SCHMEGETTES")).toBeInTheDocument();
  expect(spoken.map((u) => u.text)).toEqual(["The Final Schmegettes category is: ISLANDS."]);
  spoken[0]?.onend?.();
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "reading_done", clueId: "f" }));

  const answering: RoomState = {
    ...finalState,
    phase: "final_answer",
    activeClue: { clueId: "f", category: "ISLANDS", value: 0, state: "active", clueText: "THIS VOLCANO" },
  };
  update(answering);
  expect(screen.getByLabelText("Clue")).toHaveTextContent("THIS VOLCANO");
  update({ ...answering, deadlineAt: 999 }); // the answer window opens: no second reading
  expect(spoken.map((u) => u.text)).toEqual(["The Final Schmegettes category is: ISLANDS.", "THIS VOLCANO"]);
});

test("Final reveal shows the finalist's response and verdict", () => {
  showHost({
    ...finalState,
    phase: "final_reveal",
    scores: { a: 1200 },
    reveals: [{ userId: "a", answer: "krakatoa", verdict: "correct", delta: 400, wager: 400 }],
  });
  const reveal = screen.getByLabelText("Reveal");
  expect(reveal).toHaveTextContent("Alice · $800");
  expect(reveal).toHaveTextContent("krakatoa");
});

test("a skipped Final says so before the scores", () => {
  showHost({
    ...state,
    phase: "finished",
    results: [{ userId: "a", displayName: "Alice", score: -200, placement: 1 }],
    finalSkipped: true,
  });
  expect(screen.getByText("Nobody's in the black: no Final Schmegettes.")).toBeInTheDocument();
});

test("the host's Daily Double wager pad is on the stage, not in the column", () => {
  const send = vi.fn();
  const players = [
    { userId: "a", displayName: "Alice", role: "contestant" as const, score: 0, connected: true },
    { userId: "host", displayName: "Wyatt", role: "host" as const, score: 0, connected: true },
  ];
  const dd: RoomState = {
    ...state,
    hostPlays: true,
    players,
    phase: "daily_double_wager",
    activeClue: ddClue,
    controllingUserId: "host",
    wagerMin: 5,
    wagerMax: 800,
  };
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  try {
    showHost(dd, send);
    // Past the DAILY DOUBLE reveal; the reveal's timer re-arms after each render.
    for (let i = 0; i < 12; i++) act(() => vi.advanceTimersByTime(250));
  } finally {
    vi.useRealTimers();
  }
  const pad = screen.getByLabelText("Wager");
  expect(screen.getByLabelText("Your controls")).not.toContainElement(pad);
  for (const k of ["5", "0", "0"]) fireEvent.click(screen.getByRole("button", { name: k }));
  fireEvent.click(screen.getByRole("button", { name: "Wager" }));
  expect(send).toHaveBeenCalledWith({ type: "submit_wager", amount: 500 });
});

describe("the host plays Final", () => {
  const players = [
    { userId: "a", displayName: "Alice", role: "contestant" as const, score: 0, connected: true },
    { userId: "host", displayName: "Wyatt", role: "host" as const, score: 0, connected: true },
  ];
  const final: RoomState = {
    ...finalState,
    hostPlays: true,
    players,
    phase: "final_wager",
    finalistUserIds: ["a", "host"],
    scores: { a: 1200, host: 900 },
  };

  test("the wager pad is masked, on the stage", () => {
    const send = vi.fn();
    showHost(final, send);
    for (const k of ["7", "0", "0"]) fireEvent.click(screen.getByRole("button", { name: k }));
    expect(screen.getByLabelText("Wager amount")).toHaveTextContent("$ •••••");
    // The host's score is public (their tile); the pad shows neither the amount nor the limit.
    expect(screen.getByLabelText("Wager").textContent).not.toMatch(/700|900/);
    expect(screen.getByLabelText("Your controls")).not.toContainElement(screen.getByLabelText("Wager"));
    fireEvent.click(screen.getByRole("button", { name: "Lock in" }));
    expect(send).toHaveBeenCalledWith({ type: "submit_wager", amount: 700 });
  });

  test("the answer is typed on the blind keypad: no text field, nothing readable", () => {
    const send = vi.fn();
    showHost(
      {
        ...final,
        phase: "final_answer",
        activeClue: { clueId: "f", category: "ISLANDS", value: 0, state: "active", clueText: "THIS VOLCANO" },
      },
      send,
    );
    expect(screen.getByLabelText("Clue")).toHaveTextContent("THIS VOLCANO");
    expect(document.querySelector("input, textarea")).toBeNull();
    for (const k of ["J", "A", "V", "A"]) fireEvent.click(screen.getByRole("button", { name: k }));
    expect(document.body.textContent).not.toMatch(/java/i);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(send).toHaveBeenCalledWith({ type: "submit_answer", clueId: "f", answer: "java", source: "typed" });
  });
});

describe("the host picks by voice", () => {
  let rec: Recognizer & { started: number };
  beforeEach(() => {
    rec = {
      started: 0,
      start() {
        this.started++;
      },
      stop() {},
      abort() {},
    };
    setRecognizerFactory(() => rec);
  });
  afterEach(() => setRecognizerFactory(null));

  test("with the buzzer", () => {
    const send = host({ ...onBoard, hostPlays: true, controllingUserId: "host" });
    const buzzer = screen.getByRole("button", { name: "Buzz" });
    expect(buzzer).toHaveAttribute("data-state", "pick");
    fireEvent.click(buzzer);
    expect(rec.started).toBe(1);
    act(() => rec.onFinal?.("opera for 200"));
    expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "c2" });
  });

  test("the column shows what it hears, and why a pick failed", () => {
    const send = host({ ...onBoard, hostPlays: true, controllingUserId: "host" });
    fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
    expect(screen.getByText("Listening…")).toBeInTheDocument();
    act(() => rec.onInterim?.("opra for"));
    expect(screen.getByLabelText("What we heard")).toHaveTextContent("“opra for”");
    act(() => rec.onFinal?.("science for 400"));
    expect(screen.queryByText("Listening…")).toBeNull();
    expect(screen.getByLabelText("What we heard")).toHaveTextContent("“science for 400”");
    expect(screen.getByText("Didn't catch the category.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "select_clue" }));
  });

  test("with the space bar", () => {
    host({ ...onBoard, hostPlays: true, controllingUserId: "host" });
    fireEvent.keyDown(window, { code: "Space" });
    expect(rec.started).toBe(1);
    expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "listening");
  });
});

test("on the correct-response screen, each verdict can be overridden", () => {
  const send = vi.fn();
  const wrong = { answerId: "ans-a", userId: "a", answer: "oxygen", verdict: "incorrect", delta: -400 };
  host(
    {
      ...onBoard,
      phase: "answering",
      activeClue: clue,
      clueEnd: { state: "unanswered", correctResponse: "Nitrogen" },
      answers: [wrong],
      lastVerdict: wrong,
    },
    send,
  );
  fireEvent.click(screen.getByRole("button", { name: "Override Alice's answer" }));
  expect(send).toHaveBeenCalledWith({ type: "override_review", open: true });
  fireEvent.click(screen.getByRole("button", { name: /Mark correct/ }));
  expect(send).toHaveBeenCalledWith({ type: "override_verdict", answerId: "ans-a", correct: true });
});

test("the final scoreboard has Rematch", () => {
  const send = vi.fn();
  host(
    {
      ...onBoard,
      phase: "finished",
      results: [{ userId: "a", displayName: "Alice", score: 1200, placement: 1 }],
      startedAt: new Date(2026, 10, 9, 20, 14).getTime(),
      finishedAt: new Date(2026, 10, 9, 20, 55).getTime(),
    },
    send,
  );
  expect(screen.getByText("Nov 9 · 8:14 PM · 41 min")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Rematch" }));
  expect(send).toHaveBeenCalledWith({ type: "rematch" });
});
