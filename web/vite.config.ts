/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The deploy workflow fetches /version.json and fails unless `commit` is the merge commit.
// CI and hosts set GIT_SHA; local builds fall back to the checkout's HEAD.
const commit =
  process.env.GIT_SHA ??
  (() => {
    try {
      return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      return "unknown";
    }
  })();

function versionFile(): Plugin {
  return {
    name: "version-file",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ service: "web", commit })}\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  // The release Faro reports errors under (src/lib/faro.ts).
  define: { __COMMIT__: JSON.stringify(commit) },
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Floors: docs/system-docs/engineering/testing-strategy.md §3. `test:coverage` (CI) fails below them.
    coverage: {
      thresholds: {
        "src/lib/**": { lines: 70, statements: 70 },
        "src/pages/**": { lines: 50, statements: 50 },
        "src/game/**": { lines: 50, statements: 50 },
      },
    },
    // Placeholders so modules that read env (src/lib/env.ts) can load; tests never call out.
    env: {
      VITE_SUPABASE_URL: "http://supabase.test",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
      VITE_API_URL: "http://api.test",
      VITE_STATUS_URL: "https://status.test",
    },
  },
});
