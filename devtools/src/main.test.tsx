import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("lists the Admin page beside the design prototypes", () => {
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );
    expect(screen.getAllByText("board").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Admin"));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
