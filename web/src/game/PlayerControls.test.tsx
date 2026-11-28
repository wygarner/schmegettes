import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { initialRoom, type RoomState } from "../lib/room";
import { type Recognizer, setRecognizerFactory } from "../lib/speech";
import { PlayerControls } from "./PlayerControls";
import { ANSWER_MS, PICK_REVEAL_MS } from "./timing";

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
  expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "c1", via: "tap" });
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

test("the recognizer's other guesses go with the answer", () => {
  const open: RoomState = { ...base, phase: "buzzing_open", activeClue: clue };
  const { send, update } = setup(open);
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  // The final result arrives before the server confirms the buzz: it's held, then sent.
  act(() => rec.onFinal?.("night rogan", ["nitrogen", "x".repeat(250)]));
  update({ ...open, phase: "answering", answeringUserId: me });
  expect(send).toHaveBeenCalledWith({
    type: "submit_answer",
    clueId: "c1",
    answer: "night rogan",
    source: "voice",
    alternatives: ["nitrogen", "x".repeat(200)],
  });
});

test("listening stops after ANSWER_MS (9 s)", () => {
  vi.useFakeTimers();
  try {
    const open: RoomState = { ...base, phase: "buzzing_open", activeClue: clue };
    const { update } = setup(open);
    fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
    update({ ...open, phase: "answering", answeringUserId: me });
    vi.advanceTimersByTime(ANSWER_MS - 100);
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

test("paused because the TV has no sound", () => {
  setup({ ...base, phase: "buzzing_open", activeClue: clue, paused: true, pauseReason: "host_sound" });
  expect(screen.getByText("Waiting for the TV's sound…")).toBeInTheDocument();
});

test("paused and game over", () => {
  const { update } = setup({ ...base, phase: "buzzing_open", activeClue: clue, paused: true });
  expect(screen.getByText("Waiting for the TV…")).toBeInTheDocument();
  update({ ...base, phase: "finished", results: [{ userId: me, displayName: "Alice", score: 1200, placement: 1 }] });
  expect(screen.getByText("You finished").nextElementSibling).toHaveTextContent("1st");
});

test("the final scoreboard on a phone: my place, the standings, and Leave", () => {
  const onLeave = vi.fn();
  render(
    <MantineProvider>
      <PlayerControls
        state={{
          ...base,
          hostDisplayName: "Wyatt",
          phase: "finished",
          results: [
            { userId: "bob", displayName: "Bob", score: 2900, placement: 1 },
            { userId: me, displayName: "Alice", score: 800, placement: 2 },
          ],
        }}
        userId={me}
        send={vi.fn()}
        onLeave={onLeave}
      />
    </MantineProvider>,
  );
  expect(screen.getByText("You finished")).toBeInTheDocument();
  expect(screen.getByText("You finished").nextElementSibling).toHaveTextContent("2nd");
  const standings = screen.getByLabelText("Standings");
  expect(standings).toHaveTextContent("Bob");
  expect(standings.querySelector("[aria-current]")).toHaveTextContent("Alice");
  expect(screen.getByText("Waiting for Wyatt: stay for a rematch, or leave.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Leave" }));
  expect(onLeave).toHaveBeenCalled();
});

test("while the host reviews my answer, and after an override", () => {
  const ended: RoomState = {
    ...base,
    hostDisplayName: "Wyatt",
    phase: "buzzing_open",
    activeClue: clue,
    clueEnd: { state: "unanswered" },
    lastVerdict: { answerId: "a1", userId: me, answer: "crack a toe a", verdict: "incorrect", delta: -400 },
  };
  const { update } = setup({ ...ended, review: { open: true, userIds: [me] } });
  expect(screen.getByText("Wyatt is reviewing your answer…")).toBeInTheDocument();
  update({
    ...ended,
    review: { open: false, userIds: [me] },
    lastOverride: { answerId: "a1", userId: me, answer: "crack a toe a", verdict: "overridden_correct", delta: 400 },
  });
  expect(screen.getByText("HOST OVERRIDE")).toBeInTheDocument();
  expect(screen.getByText("+$400")).toBeInTheDocument();
  expect(screen.getByText("Wyatt changed your answer to correct.")).toBeInTheDocument();
});

test("my answer voided by an override says it doesn't count", () => {
  setup({
    ...base,
    hostDisplayName: "Wyatt",
    phase: "buzzing_open",
    activeClue: clue,
    clueEnd: { state: "answered" },
    answers: [
      { answerId: "a0", userId: "bob", answer: "crack a toe a", verdict: "overridden_correct", delta: 400 },
      { answerId: "a1", userId: me, answer: "krakatoa", verdict: "voided", delta: 0 },
    ],
    lastOverride: { answerId: "a0", userId: "bob", answer: "crack a toe a", verdict: "overridden_correct", delta: 400 },
  });
  expect(screen.getByText("DOESN'T COUNT")).toBeInTheDocument();
  expect(screen.getByText("Doesn't count: the host overrode an earlier answer.")).toBeInTheDocument();
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

test("the controller presses the buzzer and says a clue instead of tapping it", () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  expect(screen.getByRole("button", { name: "SCIENCE for 400" })).toBeInTheDocument(); // the board is still there
  expect(screen.queryByRole("button", { name: /say/i })).not.toBeInTheDocument(); // no separate microphone button
  const buzzer = screen.getByRole("button", { name: "Buzz" });
  expect(buzzer).toHaveAttribute("data-state", "pick");
  expect(screen.getByText("Tap a clue, or press and say it")).toBeInTheDocument();
  fireEvent.click(buzzer);
  expect(rec.started).toBe(1);
  expect(buzzer).toHaveAttribute("data-state", "listening");
  act(() => rec.onFinal?.("science for four hundred"));
  // A spoken pick goes straight through: no confirmation.
  expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "c1", via: "voice" });
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "buzz" }));
});

test("pressing the buzzer again while listening cancels the pick", () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  const buzzer = screen.getByRole("button", { name: "Buzz" });
  fireEvent.click(buzzer);
  fireEvent.click(buzzer);
  expect(rec.aborted).toBe(1);
  expect(buzzer).toHaveAttribute("data-state", "pick");
  act(() => rec.onFinal?.("science for four hundred")); // late result from the cancelled recognizer
  expect(send).not.toHaveBeenCalled();
});

test("a voice pick that doesn't match says so and reports one miss", () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  act(() => rec.onFinal?.("opera for 200"));
  expect(screen.getByText(/Didn't catch the category/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "pick");
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith({
    type: "voice_pick_missed",
    problem: "no-category",
    heard: "opera for 200",
    alternatives: [],
  });
});

test("a second hearing can pick while the UI keeps showing the top hearing", () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  act(() => rec.onFinal?.("signs for 400", ["science for 400"]));
  expect(screen.getByLabelText("What we heard")).toHaveTextContent("signs for 400");
  expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "c1", via: "voice" });
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "voice_pick_missed" }));
});

test("an empty hearing reports nothing-heard", () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  act(() => rec.onFinal?.(""));
  expect(screen.getByText(/Didn't hear anything\./)).toBeInTheDocument();
  expect(send).toHaveBeenCalledWith({
    type: "voice_pick_missed",
    problem: "nothing-heard",
    heard: "",
    alternatives: [],
  });
});

test("Quick picks: the hint says a category is enough, and it picks the lowest left", () => {
  const board = [
    { clueId: "s2", category: "SCIENCE", value: 200, state: "answered" as const },
    { clueId: "s4", category: "SCIENCE", value: 400, state: "unplayed" as const },
    { clueId: "s6", category: "SCIENCE", value: 600, state: "unplayed" as const },
  ];
  const { send } = setup({ ...base, phase: "board", controllingUserId: me, board, quickPicks: true });
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  expect(screen.getByText("Say a category, like “Opera”, or a category and value")).toBeInTheDocument();
  act(() => rec.onFinal?.("science"));
  expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "s4", via: "voice" });
});

test("without Quick picks, just a category asks for the amount", () => {
  const board = [
    { clueId: "s4", category: "SCIENCE", value: 400, state: "unplayed" as const },
    { clueId: "s6", category: "SCIENCE", value: 600, state: "unplayed" as const },
  ];
  const { send } = setup({ ...base, phase: "board", controllingUserId: me, board });
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  expect(screen.getByText("Say a category and value, like “Opera for 600”")).toBeInTheDocument();
  act(() => rec.onFinal?.("science"));
  expect(screen.getByText(/Didn't catch the amount/)).toBeInTheDocument();
  expect(send).toHaveBeenCalledWith({
    type: "voice_pick_missed",
    problem: "no-value",
    heard: "science",
    alternatives: [],
  });
});

test("listening stops when control moves on", () => {
  const { update } = setup({ ...base, phase: "board", controllingUserId: me });
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  update({ ...base, phase: "board", controllingUserId: "bob" });
  expect(rec.aborted).toBe(1);
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "idle");
});

test("players without control press the buzzer on the board and nothing happens", () => {
  const { send } = setup({ ...base, phase: "board" });
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  expect(rec.started).toBe(0);
  expect(send).not.toHaveBeenCalled();
});

const dd = { clueId: "c1", category: "SCIENCE", value: 400, state: "active" as const, dailyDouble: true };

test("the Daily Double picker wagers on the phone; others wait", () => {
  const ddState: RoomState = {
    ...base,
    phase: "daily_double_wager",
    activeClue: dd,
    controllingUserId: me,
    wagerMin: 5,
    wagerMax: 800,
  };
  const { send, update } = setup(ddState);
  expect(screen.getByText(/Daily Double! SCIENCE/)).toBeInTheDocument();
  for (const k of ["5", "0", "0"]) fireEvent.click(screen.getByRole("button", { name: k }));
  fireEvent.click(screen.getByRole("button", { name: "Wager" }));
  expect(send).toHaveBeenCalledWith({ type: "submit_wager", amount: 500 });

  update({ ...ddState, controllingUserId: "bob" });
  expect(screen.getByText("Bob is wagering…")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Wager" })).toBeNull();
});

test("nobody can buzz on a Daily Double", () => {
  const { send } = setup({ ...base, phase: "clue_reading", activeClue: dd, controllingUserId: "bob" });
  expect(screen.getByText("Bob is answering a Daily Double.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /buzz/i }));
  expect(send).not.toHaveBeenCalled();
});

const finalClue = { clueId: "f", category: "ISLANDS", value: 0, state: "active" as const };

test("a finalist wagers secretly, then types the answer", () => {
  const wagerState: RoomState = {
    ...base,
    phase: "final_wager",
    round: "final",
    activeClue: { ...finalClue, state: "unplayed" },
    finalistUserIds: [me, "bob"],
    scores: { [me]: 600 },
  };
  const { send, update } = setup(wagerState);
  expect(screen.getByText("Final: ISLANDS")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Max" }));
  fireEvent.click(screen.getByRole("button", { name: "Lock in" }));
  expect(send).toHaveBeenCalledWith({ type: "submit_wager", amount: 600 });

  update({ ...wagerState, lockedUserIds: [me], mine: { wager: 600 } });
  expect(screen.getByText(/Wager locked: \$600/)).toBeInTheDocument();

  update({ ...wagerState, phase: "final_answer", activeClue: finalClue, lockedUserIds: [], mine: { wager: 600 } });
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "krakatoa" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(send).toHaveBeenCalledWith({ type: "submit_answer", clueId: "f", answer: "krakatoa", source: "typed" });
});

test("a player not in Final is told to watch", () => {
  setup({ ...base, phase: "final_wager", activeClue: finalClue, finalistUserIds: ["bob"] });
  expect(screen.getByText("You're not in Final. Watch the TV.")).toBeInTheDocument();
});

test("the host's column never shows a wager pad or a Final answer field (they're on the stage)", () => {
  const send = vi.fn();
  const s: RoomState = {
    ...base,
    phase: "final_wager",
    activeClue: finalClue,
    finalistUserIds: [me],
    scores: { [me]: 900 },
  };
  const r = render(
    <MantineProvider>
      <PlayerControls state={s} userId={me} send={send} compact />
    </MantineProvider>,
  );
  expect(screen.queryByLabelText("Wager amount")).toBeNull();
  r.rerender(
    <MantineProvider>
      <PlayerControls state={{ ...s, phase: "final_answer", lockedUserIds: [] }} userId={me} send={send} compact />
    </MantineProvider>,
  );
  expect(screen.queryByLabelText("Your answer")).toBeNull();
  expect(document.querySelector("input")).toBeNull();
});

test("during the pick reveal the phone names the pick, then says Listen", () => {
  vi.useFakeTimers();
  try {
    const pick = { clueId: "v4", category: "VOLCANOES", value: 400, state: "active" as const };
    setup({ ...base, phase: "clue_reading", activeClue: pick, reveal: { clueId: "v4", kind: "card" } });
    expect(screen.getByText("VOLCANOES for $400")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(PICK_REVEAL_MS));
    expect(screen.getByText("Listen…")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
