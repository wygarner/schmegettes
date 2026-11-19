import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { playBuzz } from "../lib/sfx";
import { Buzzer, type BuzzerState } from "./Buzzer";

vi.mock("../lib/sfx", () => ({ playBuzz: vi.fn(async () => undefined) }));

const cases: [BuzzerState, string, boolean, boolean][] = [
  // state, what screen readers hear, enabled, a press calls onBuzz
  ["idle", "Not now", true, false],
  ["dim", "Get ready", true, true],
  ["lit", "Buzz now", true, true],
  ["early", "Too early", true, false],
  ["answering", "Answer now", true, false],
  ["locked", "You've answered this one", false, false],
  ["pick", "Press and say your pick", true, true],
  ["listening", "Listening for your pick", true, true],
];

test.each(cases)("%s", (state, description, enabled, presses) => {
  const onBuzz = vi.fn();
  render(
    <MantineProvider>
      <Buzzer state={state} onBuzz={onBuzz} />
    </MantineProvider>,
  );
  const button = screen.getByRole("button", { name: "Buzz" });
  // No lettering on the dome: the only text is the screen-reader description.
  expect(button).toHaveAccessibleDescription(description);
  expect(button.textContent).toBe(description);
  expect(screen.queryByText(/BUZZ/)).toBeNull();
  expect(button).toHaveAttribute("data-state", state);
  expect(button.hasAttribute("disabled")).toBe(!enabled);
  fireEvent.click(button);
  expect(onBuzz).toHaveBeenCalledTimes(presses ? 1 : 0);
});

test("never shorter than 64 px", () => {
  render(
    <MantineProvider>
      <Buzzer state="idle" onBuzz={vi.fn()} height={40} />
    </MantineProvider>,
  );
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveStyle({ height: "64px" });
});

describe("the press sound", () => {
  test.each([
    ["dim", true],
    ["lit", true],
    ["pick", true],
    ["idle", false],
    ["answering", false],
    ["listening", false],
    ["early", false],
  ] as const)("%s: sound %s", (state, sounds) => {
    vi.mocked(playBuzz).mockClear();
    render(
      <MantineProvider>
        <Buzzer state={state} onBuzz={() => {}} />
      </MantineProvider>,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Buzz" }));
    expect(playBuzz).toHaveBeenCalledTimes(sounds ? 1 : 0);
  });
});
