import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Notice } from "../lib/notices";
import { NoticeBanner } from "./NoticeBanner";

const make = (id: string, kind: Notice["kind"], title: string): Notice => ({
  id,
  revision: 1,
  kind,
  phase: "active",
  title,
  body: "Body",
  link: null,
  startsAt: null,
  endsAt: null,
  resolvedAt: null,
  resolution: null,
});

test("shows the highest priority notice and opens the more sheet", async () => {
  const dismiss = vi.fn();
  render(
    <MantineProvider>
      <NoticeBanner
        notices={[make("1", "incident", "Incident"), make("2", "whats_new", "Release")]}
        onDismiss={dismiss}
      />
    </MantineProvider>,
  );
  expect(screen.getByText("Incident")).toBeInTheDocument();
  expect(screen.getByText("+1 more ›")).toBeInTheDocument();
  fireEvent.click(screen.getByText("+1 more ›"));
  expect(await screen.findByRole("dialog", { name: "Service notices" })).toHaveTextContent("What's new: Release");
  fireEvent.click(screen.getAllByRole("button", { name: "Dismiss Incident" })[0] as HTMLElement);
  expect(dismiss).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
});
