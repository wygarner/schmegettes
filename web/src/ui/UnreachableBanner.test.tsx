import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { UnreachableBanner } from "./UnreachableBanner";

test("offline has no status link", () => {
  render(<UnreachableBanner state="offline" />);
  expect(screen.getByText("You're offline.")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});

test("unreachable explains the outage", () => {
  render(<UnreachableBanner state="unreachable" />);
  expect(screen.getByRole("alert")).toHaveTextContent("Can't reach Schmegettes right now");
  expect(screen.getByRole("link", { name: "Status ›" })).toHaveAttribute("href", "https://status.test");
});
