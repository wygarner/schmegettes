import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { initialRoom, type RoomState } from "../lib/room";
import { type Recognizer, setRecognizerFactory } from "../lib/speech";
import { PlayerControls } from "./PlayerControls";

const me = "me";
const clue = { clueId: "c1", category: "SCIENCE", value: 400, state: "active" as const };
const players = [
  { userId: me, displayName: "Alice", role: "contestant" as const, score: 0, connected: true },
  { userId: "bob", displayName: "Bob", role: "contestant" as const, score: 0, connected: true },
];
const base: RoomState = {
  ...initialRoom,
  connection: "open",
  players,
  board: [{ ...clue, state: "unplayed" }],
  controllingUserId: "bob",
};

let rec: Recognizer & { started: number; aborted: number; stopped: number };
beforeEach(() => {
  rec = {
    started: 0,
    aborted: 0,
    stopped: 0,
    start() {
      this.started++;
    },
    stop() {
      this.stopped++;
    },
    abort() {
      this.aborted++;
    },
  };
  setRecognizerFactory(() => rec);
});
afterEach(() => setRecognizerFactory(null));

function setup(state: RoomState) {
  const send = vi.fn();
  const view = (s: RoomState) => (
    <MantineProvider>
      <PlayerControls state={s} userId={me} send={send} />
    </MantineProvider>
  );
  const r = render(view(state));
  return { send, update: (s: RoomState) => r.rerender(view(s)) };
}

test("a tapped pick is confirmed before it's sent", async () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  fireEvent.click(screen.getByRole("button", { name: "SCIENCE for 400" }));
  expect(send).not.toHaveBeenCalled();
  expect(await screen.findByText("SCIENCE for $400?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pick" }));
  expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "c1" });
});

test("Cancel sends nothing", async () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  fireEvent.click(screen.getByRole("button", { name: "SCIENCE for 400" }));
  fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(send).not.toHaveBeenCalled();
});

test("the question closes when control moves on", async () => {
  const { update } = setup({ ...base, phase: "board", controllingUserId: me });
  fireEvent.click(screen.getByRole("button", { name: "SCIENCE for 400" }));
  await screen.findByText("SCIENCE for $400?");
  update({ ...base, phase: "board", controllingUserId: "bob" });
  await waitFor(() => expect(screen.queryByText("SCIENCE for $400?")).not.toBeInTheDocument());
});

test("the pick screen has no 'Your pick' heading and no score", () => {
  setup({ ...base, phase: "board", controllingUserId: me });
  expect(screen.queryByText("Your pick")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Your score")).not.toBeInTheDocument();
});

test("the buzzer is on screen in every phase", () => {
  const cases: RoomState[] = [
    { ...base, phase: "board", controllingUserId: me },
    { ...base, phase: "board" },
    { ...base, phase: "clue_reading", activeClue: clue },
    { ...base, phase: "buzzing_open", activeClue: clue },
    { ...base, phase: "answering", activeClue: clue, answeringUserId: me },
    { ...base, phase: "answering", activeClue: clue, answeringUserId: "bob" },
    {
      ...base,
      phase: "answering",
      activeClue: clue,
      lastVerdict: { userId: me, answer: "x", verdict: "correct", delta: 400 },
    },
    { ...base, phase: "buzzing_open", activeClue: clue, clueEnd: { state: "unanswered" } },
    { ...base, phase: "board", roundIntro: "double" },
    { ...base, phase: "board", paused: true },
    { ...base, phase: "finished", results: [{ userId: me, displayName: "Alice", score: 0, placement: 1 }] },
  ];
  const { update } = setup(cases[0] as RoomState);
  for (const c of cases) {
    update(c);
    expect(screen.getByRole("button", { name: "Buzz" })).toBeInTheDocument();
  }
});

test("an idle buzzer tap sends nothing", () => {
  const { send } = setup({ ...base, phase: "board" });
  const buzzer = screen.getByRole("button", { name: "Buzz" });
  expect(buzzer).toHaveAttribute("data-state", "idle");
  fireEvent.click(buzzer);
  expect(send).not.toHaveBeenCalled();
});

test("others see who is picking", () => {
  setup({ ...base, phase: "board" });
  expect(screen.getByText("Bob is picking…")).toBeInTheDocument();
});

test("buzzer is dim while reading, lit when open, locked once tried", () => {
  const { update } = setup({ ...base, phase: "clue_reading", activeClue: clue });
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "dim");
  update({ ...base, phase: "buzzing_open", activeClue: clue });
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "lit");
  update({ ...base, phase: "buzzing_open", activeClue: clue, attemptedUserIds: ["bob", me] });
  expect(screen.getByRole("button", { name: "Buzz" })).toBeDisabled();
});

test("winning a buzz: listening starts on the tap, words stream, the final text is submitted", () => {
  vi.useFakeTimers();
  try {
    const open: RoomState = { ...base, phase: "buzzing_open", activeClue: clue };
    const { send, update } = setup(open);
    fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
    expect(rec.started).toBe(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "buzz", clueId: "c1" }));

    // Words heard before the server confirms aren't sent.
    act(() => rec.onInterim?.("what"));
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "answer_progress" }));

    update({ ...open, phase: "answering", answeringUserId: me });
    expect(screen.getByText("Answer now")).toBeInTheDocument();
    vi.advanceTimersByTime(300);
    act(() => rec.onInterim?.("what is nit"));
    expect(send).toHaveBeenCalledWith({ type: "answer_progress", clueId: "c1", text: "what is nit" });

    act(() => rec.onFinal?.("what is nitrogen"));
    expect(send).toHaveBeenCalledWith({
      type: "submit_answer",
      clueId: "c1",
      answer: "what is nitrogen",
      source: "voice",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("listening stops after 14 s", () => {
  vi.useFakeTimers();
  try {
    const open: RoomState = { ...base, phase: "buzzing_open", activeClue: clue };
    const { update } = setup(open);
    fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
    update({ ...open, phase: "answering", answeringUserId: me });
    vi.advanceTimersByTime(13900);
    expect(rec.stopped).toBe(0);
    vi.advanceTimersByTime(100);
    expect(rec.stopped).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

test("losing the buzz throws the recording away", () => {
  const open: RoomState = { ...base, phase: "buzzing_open", activeClue: clue };
  const { send, update } = setup(open);
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  update({ ...open, phase: "answering", answeringUserId: "bob" });
  expect(rec.aborted).toBe(1);
  expect(screen.getByText("Bob is answering…")).toBeInTheDocument();
  act(() => rec.onFinal?.("too late"));
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "submit_answer" }));
});

test("an early buzz doesn't open the microphone", () => {
  setup({ ...base, phase: "clue_reading", activeClue: clue });
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  expect(rec.started).toBe(0);
});

test("paused and game over", () => {
  const { update } = setup({ ...base, phase: "buzzing_open", activeClue: clue, paused: true });
  expect(screen.getByText("Waiting for the TV…")).toBeInTheDocument();
  update({ ...base, phase: "finished", results: [{ userId: me, displayName: "Alice", score: 1200, placement: 1 }] });
  expect(screen.getByText("Final: $1,200 · place 1")).toBeInTheDocument();
});

test("no lit buzzer once the clue has ended or between rounds", () => {
  const { update } = setup({
    ...base,
    phase: "buzzing_open",
    activeClue: clue,
    clueEnd: { state: "unanswered" },
  });
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "idle");
  expect(screen.getByText("Look at the TV.")).toBeInTheDocument();
  update({ ...base, phase: "answering", roundIntro: "double" });
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "idle");
  expect(screen.getByText("Double Schmegettes!")).toBeInTheDocument();
});

test("the controller can say a clue instead of tapping it", () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  expect(screen.getByRole("button", { name: "SCIENCE for 400" })).toBeInTheDocument(); // the board is still there
  fireEvent.click(screen.getByRole("button", { name: "Say a clue" }));
  expect(rec.started).toBe(1);
  act(() => rec.onFinal?.("science for four hundred"));
  expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "c1" });
});

test("a voice pick that doesn't match says so and picks nothing", () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  fireEvent.click(screen.getByRole("button", { name: "Say a clue" }));
  act(() => rec.onFinal?.("opera for 200"));
  expect(screen.getByText(/Didn't catch the category/)).toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
});

test("players without control don't get the voice button", () => {
  setup({ ...base, phase: "board" });
  expect(screen.queryByRole("button", { name: "Say a clue" })).not.toBeInTheDocument();
});
