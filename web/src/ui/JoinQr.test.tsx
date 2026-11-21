import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { JoinQr, joinUrl } from "./JoinQr";

const encoded: string[] = [];
vi.mock("qrcode-generator", async (original) => {
  const actual = (await original<{ default: typeof import("qrcode-generator") }>()).default;
  const spy = ((type: Parameters<typeof actual>[0], level: Parameters<typeof actual>[1]) => {
    const qr = actual(type, level);
    const add = qr.addData.bind(qr);
    qr.addData = (data: string, mode?: Parameters<typeof qr.addData>[1]) => {
      encoded.push(data);
      add(data, mode);
    };
    return qr;
  }) as typeof actual;
  return { default: spy };
});

test("it opens this environment's join page for the room", () => {
  expect(joinUrl("https://staging.schmegettes.app", "K7RXM")).toBe("https://staging.schmegettes.app/join/K7RXM");
  render(<JoinQr code="K7RXM" size="120px" origin="https://schmegettes.app" />);
  expect(encoded).toContain("https://schmegettes.app/join/K7RXM");
  const img = screen.getByRole("img", { name: "QR code to join room K7RXM" });
  // A white square behind dark modules, with a 4-module margin on every side.
  const [rect, path] = [img.querySelector("rect"), img.querySelector("path")];
  expect(rect).toHaveAttribute("fill", "#fff");
  expect(path).toHaveAttribute("fill", "#000");
  expect(path?.getAttribute("d")).toMatch(/^M4 4h1v1h-1z/);
});
