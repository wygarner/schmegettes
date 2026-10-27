import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, test } from "vitest";
import { JoinCode } from "./JoinCode";

test("/join takes a code and moves on to the name step", () => {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/join"]}>
        <Routes>
          <Route path="/join" element={<JoinCode />} />
          <Route path="/join/:code" element={<p>name step</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
  const next = screen.getByRole("button", { name: "Next" });
  expect(next).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "k7-rxm" } });
  expect(next).toBeEnabled();
  fireEvent.click(next);
  expect(screen.getByText("name step")).toBeInTheDocument();
});
