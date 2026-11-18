/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ngrok gives the iPhone an https URL for on-device spikes (storage APIs need a secure context).
export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: [".ngrok-free.app", ".ngrok.app"] },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] },
});
