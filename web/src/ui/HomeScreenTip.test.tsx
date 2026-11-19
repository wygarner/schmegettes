import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { needsHomeScreenTip } from "../lib/fullscreen";
import { HomeScreenTip } from "./HomeScreenTip";

vi.mock("../lib/fullscreen", () => ({ needsHomeScreenTip: vi.fn() }));

const show = () =>
  render(
    <MantineProvider>
      <HomeScreenTip />
    </MantineProvider>,
  );

afterEach(() => {
  vi.restoreAllMocks(); // first: a test may have blocked storage
  window.localStorage.clear();
});

test("shows the steps where the toolbar can't be hidden", () => {
  vi.mocked(needsHomeScreenTip).mockReturnValue(true);
  show();
  expect(screen.getByRole("note", { name: "Full screen tip" })).toHaveTextContent(
    "For full screen, add Schmegettes to your Home Screen: tap Share, then Add to Home Screen.",
  );
});

test("nothing elsewhere", () => {
  vi.mocked(needsHomeScreenTip).mockReturnValue(false);
  show();
  expect(screen.queryByRole("note")).toBeNull();
});

test("✕ hides it for good on this device", () => {
  vi.mocked(needsHomeScreenTip).mockReturnValue(true);
  const { unmount } = show();
  fireEvent.click(screen.getByRole("button", { name: "Hide this tip" }));
  expect(screen.queryByRole("note")).toBeNull();
  unmount();
  show();
  expect(screen.queryByRole("note")).toBeNull();
});

test("blocked storage doesn't break it", () => {
  vi.mocked(needsHomeScreenTip).mockReturnValue(true);
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new Error("blocked");
  });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Hide this tip" }));
  expect(screen.queryByRole("note")).toBeNull();
});
