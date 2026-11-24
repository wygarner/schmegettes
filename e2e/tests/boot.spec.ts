// CI's boot check for web: the production build, served by `vite preview`, loads Home with no
// console error or uncaught exception. Run by the `boot` job in .github/workflows/ci.yml.
import { expect, test } from "@playwright/test";

test("Home loads from the production build without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SCHMEGETTES" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Host a game" })).toBeVisible();
  // Give the guest sign-in and first api calls time to fail, if they're going to.
  await page.waitForLoadState("networkidle");

  expect(errors).toEqual([]);
});
