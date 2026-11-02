import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Buzzer, type BuzzerState } from "./Buzzer";

const cases: [BuzzerState, string, boolean, boolean][] = [
  // state, label, enabled, a tap buzzes
  ["idle", "BUZZ", true, false],
  ["dim", "BUZZ", true, true],
  ["lit", "BUZZ", true, true],
  ["early", "Too early", true, false],
  ["answering", "Answer now", true, false],
  ["locked", "You've answered this one", false, false],
];

test.each(cases)("%s", (state, label, enabled, buzzes) => {
  const onBuzz = vi.fn();
  render(
    <MantineProvider>
      <Buzzer state={state} onBuzz={onBuzz} />
    </MantineProvider>,
  );
  const button = screen.getByRole("button", { name: "Buzz" });
  expect(button).toHaveTextContent(label);
  expect(button.hasAttribute("disabled")).toBe(!enabled);
  fireEvent.click(button);
  expect(onBuzz).toHaveBeenCalledTimes(buzzes ? 1 : 0);
});
