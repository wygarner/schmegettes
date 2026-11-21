import { defineConfig, devices } from "@playwright/test";

// Two projects:
// - critical-path: the release suite, against a deployed environment (E2E_BASE_URL).
// - boot: CI's boot check, against `vite preview` of the production build (BOOT_BASE_URL).
// Rules: docs/system-docs/engineering/testing-strategy.md.
export default defineConfig({
  testDir: "tests",
  retries: 0,
  // Staging is a real network away: allow more than the 5 s default for a screen to update.
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [
    {
      name: "critical-path",
      testMatch: "critical-path.spec.ts",
      timeout: 10 * 60_000,
      use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173" },
    },
    {
      name: "boot",
      testMatch: "boot.spec.ts",
      timeout: 60_000,
      use: { baseURL: process.env.BOOT_BASE_URL ?? "http://localhost:4173" },
    },
  ],
});
