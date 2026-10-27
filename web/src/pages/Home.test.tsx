import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Home, normalizeRoomCode } from "./Home";

test("normalizes room codes to five uppercase characters", () => {
  expect(normalizeRoomCode("ab-c d1x9")).toBe("ABCD1");
});

test("enables Join only for a full code", () => {
  render(
    <MantineProvider>
      <Home />
    </MantineProvider>,
  );
  const join = screen.getByRole("button", { name: "Join" });
  expect(join).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "abcde" } });
  expect(join).toBeEnabled();
});
