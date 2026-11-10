import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentSecurityPolicy, outputConfig, writeOutput } from "./vercel-output.mjs";

const env = {
  VITE_SUPABASE_URL: "https://abc.supabase.co",
  VITE_API_URL: "https://schmegettes-api-staging.fly.dev",
  GAME_SOCKET_ORIGIN: "wss://schmegettes-game-staging.fly.dev",
};

type Route = { src?: string; handle?: string; dest?: string; status?: number; headers?: Record<string, string> };
const routes = (): Route[] => outputConfig(env).routes as Route[];
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `));

describe("contentSecurityPolicy", () => {
  it("allows exactly the configured origins to connect", () => {
    expect(directive(contentSecurityPolicy(env), "connect-src")).toBe(
      "connect-src 'self' https://abc.supabase.co https://schmegettes-api-staging.fly.dev wss://schmegettes-game-staging.fly.dev",
    );
  });

  it("uses origins, not full URLs", () => {
    const csp = contentSecurityPolicy({ ...env, VITE_API_URL: "https://api.example.app/v1/" });
    expect(directive(csp, "connect-src")).toContain(" https://api.example.app ");
  });

  it("locks down scripts, framing, and plugins", () => {
    const csp = contentSecurityPolicy(env);
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "script-src")).toBe("script-src 'self'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it.each([
    ["VITE_SUPABASE_URL", undefined, "is not set"],
    ["VITE_API_URL", "", "is not set"],
    ["VITE_API_URL", "http://api.example.app", "must use https:"],
    ["VITE_SUPABASE_URL", "not a url", "is not a URL"],
    ["GAME_SOCKET_ORIGIN", "ws://game.example.app", "must use wss:"],
    ["GAME_SOCKET_ORIGIN", "https://game.example.app", "must use wss:"],
  ])("rejects %s=%s", (name, value, message) => {
    expect(() => contentSecurityPolicy({ ...env, [name]: value })).toThrow(message);
  });
});

describe("outputConfig", () => {
  it("sends the security headers on every path", () => {
    const all = routes()[0];
    expect(all?.src).toBe("^/(.*)$");
    expect(Object.keys(all?.headers ?? {})).toEqual([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "X-Robots-Tag",
    ]);
    expect(all?.headers?.["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(all?.headers?.["Strict-Transport-Security"]).toMatch(/^max-age=\d{8,}/);
    expect(all?.headers?.["Permissions-Policy"]).toContain("microphone=(self)");
  });

  it("serves real files before the app shell, and never serves the shell for a missing asset", () => {
    const r = routes();
    const fs = r.findIndex((x) => x.handle === "filesystem");
    const missingAsset = r.findIndex((x) => x.src === "^/assets/(.*)$" && x.status === 404);
    const fallback = r.findIndex((x) => x.dest === "/index.html");
    expect(fs).toBeGreaterThan(0);
    expect(missingAsset).toBeGreaterThan(fs);
    expect(fallback).toBe(r.length - 1);
    expect(r[fallback]?.src).toBe("^/(.*)$");
  });

  it("never caches index.html, version.json, or the app shell", () => {
    const noStore = routes().filter((x) => x.headers?.["Cache-Control"] === "no-store");
    for (const path of ["/", "/index.html", "/version.json"]) {
      expect(noStore.some((x) => x.src && new RegExp(x.src).test(path))).toBe(true);
    }
    expect(routes().at(-1)?.headers?.["Cache-Control"]).toBe("no-store");
  });
});

describe("writeOutput", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("copies dist into static/ and writes config.json", () => {
    dir = mkdtempSync(join(tmpdir(), "vercel-output-"));
    mkdirSync(join(dir, "dist", "assets"), { recursive: true });
    writeFileSync(join(dir, "dist", "index.html"), "<html></html>");
    writeFileSync(join(dir, "dist", "version.json"), '{"service":"web","commit":"abc"}');
    writeFileSync(join(dir, "dist", "assets", "app.js"), "");

    const out = writeOutput(dir, env);

    expect(readFileSync(join(out, "static", "version.json"), "utf8")).toContain('"commit":"abc"');
    expect(readFileSync(join(out, "static", "assets", "app.js"), "utf8")).toBe("");
    expect(JSON.parse(readFileSync(join(out, "config.json"), "utf8"))).toEqual(outputConfig(env));
  });

  it("fails without a complete build", () => {
    dir = mkdtempSync(join(tmpdir(), "vercel-output-"));
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "dist", "index.html"), "<html></html>");
    expect(() => writeOutput(dir, env)).toThrow("web/dist is incomplete");
  });
});
