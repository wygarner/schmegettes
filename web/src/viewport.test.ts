import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

// Android Chrome resizes only the visual viewport for the on-screen keyboard unless the page
// asks for the layout to resize too; without it the keyboard covers the field being typed in
// (GH-336). iPhone Safari ignores the key.
test("the viewport resizes the layout for the on-screen keyboard", () => {
  const html = readFileSync(resolve(__dirname, "../index.html"), "utf8");
  const content = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? "";
  const keys = content.split(",").map((s) => s.trim());
  expect(keys).toContain("interactive-widget=resizes-content");
  expect(keys).toContain("viewport-fit=cover");
  expect(keys).toContain("width=device-width");
});
