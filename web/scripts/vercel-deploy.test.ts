import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectFiles, contentSecurityPolicy, deploy, vercelConfig } from "./vercel-deploy.mjs";

const env = {
  VITE_SUPABASE_URL: "https://abc.supabase.co",
  VITE_API_URL: "https://schmegettes-api-staging.fly.dev",
  GAME_SOCKET_ORIGIN: "wss://schmegettes-game-staging.fly.dev",
};
const vercelEnv = {
  ...env,
  VERCEL_TOKEN: "tok",
  VERCEL_ORG_ID: "team_1",
  VERCEL_PROJECT_ID: "prj_1",
  GIT_SHA: "abc123",
};

type Route = { src?: string; handle?: string; dest?: string; status?: number; headers?: Record<string, string> };
const routes = (): Route[] => vercelConfig(env).routes as Route[];
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `));

describe("contentSecurityPolicy", () => {
  it("allows exactly the configured origins, and the voice downloads, to connect", () => {
    expect(directive(contentSecurityPolicy(env), "connect-src")).toBe(
      "connect-src 'self' https://abc.supabase.co https://schmegettes-api-staging.fly.dev wss://schmegettes-game-staging.fly.dev https://huggingface.co https://*.hf.co",
    );
  });

  it("uses origins, not full URLs", () => {
    const csp = contentSecurityPolicy({ ...env, VITE_API_URL: "https://api.example.app/v1/" });
    expect(directive(csp, "connect-src")).toContain(" https://api.example.app ");
  });

  it("locks down scripts, framing, and plugins", () => {
    const csp = contentSecurityPolicy(env);
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    // WebAssembly compilation only (the narrator); never JavaScript eval.
    expect(csp).not.toContain("'unsafe-eval'");
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

describe("vercelConfig", () => {
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

describe("collectFiles", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const build = () => {
    dir = mkdtempSync(join(tmpdir(), "vercel-deploy-"));
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "version.json"), '{"service":"web","commit":"abc"}');
    writeFileSync(join(dir, "assets", "app.js"), "console.log(1)");
  };

  it("lists every built file with forward-slash paths, sizes, and SHA-1s, plus vercel.json", () => {
    build();
    const files = collectFiles(dir, env);
    expect(files.map((f) => f.file).sort()).toEqual(["assets/app.js", "index.html", "vercel.json", "version.json"]);
    const app = files.find((f) => f.file === "assets/app.js");
    expect(app?.size).toBe(14);
    expect(app?.sha).toBe(createHash("sha1").update("console.log(1)").digest("hex"));
    const config = JSON.parse(files.find((f) => f.file === "vercel.json")?.data.toString() ?? "{}");
    expect(config).toEqual(vercelConfig(env));
  });

  it("fails without a complete build", () => {
    dir = mkdtempSync(join(tmpdir(), "vercel-deploy-"));
    writeFileSync(join(dir, "index.html"), "<html></html>");
    expect(() => collectFiles(dir, env)).toThrow("web/dist is incomplete");
  });

  it("fails on a bad origin before anything is uploaded", () => {
    build();
    expect(() => collectFiles(dir, { ...env, VITE_API_URL: "http://api.example.app" })).toThrow("must use https:");
  });
});

describe("deploy", () => {
  const files = [
    { file: "index.html", data: Buffer.from("<html></html>"), sha: "s1", size: 13 },
    { file: "vercel.json", data: Buffer.from("{}"), sha: "s2", size: 2 },
  ];

  type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };
  function fakeVercel(states: string[], failUpload = false) {
    const calls: Call[] = [];
    const fetchImpl = async (
      url: string,
      init: { method: string; headers: Record<string, string>; body?: unknown },
    ) => {
      calls.push({ url, ...init });
      const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
      if (url.includes("/v2/files"))
        return failUpload ? reply(403, { error: { message: "forbidden" } }) : reply(200, {});
      if (init.method === "POST") return reply(200, { id: "dpl_1", url: "x.vercel.app", readyState: states.shift() });
      return reply(200, { readyState: states.shift() });
    };
    return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
  }
  const noSleep = async () => {};

  it("uploads every file, then creates a production deployment of the project, and waits for READY", async () => {
    const { calls, fetchImpl } = fakeVercel(["QUEUED", "BUILDING", "READY"]);
    await expect(deploy(files, vercelEnv, { fetchImpl, sleep: noSleep })).resolves.toEqual({
      id: "dpl_1",
      url: "x.vercel.app",
    });

    const uploads = calls.filter((c) => c.url.includes("/v2/files"));
    expect(uploads.map((u) => u.headers["x-vercel-digest"])).toEqual(["s1", "s2"]);
    expect(uploads.every((u) => u.url.endsWith("?teamId=team_1"))).toBe(true);
    expect(calls.every((c) => c.headers.Authorization === "Bearer tok")).toBe(true);

    const create = calls.find((c) => c.url.includes("/v13/deployments?"));
    const body = JSON.parse(String(create?.body));
    expect(body.project).toBe("prj_1");
    expect(body.target).toBe("production");
    expect(body.files).toEqual([
      { file: "index.html", sha: "s1", size: 13 },
      { file: "vercel.json", sha: "s2", size: 2 },
    ]);
    expect(body.meta).toEqual({ githubCommitSha: "abc123" });
    expect(calls.filter((c) => c.url.includes("/v13/deployments/dpl_1")).length).toBe(2);
  });

  it("fails when the deployment errors", async () => {
    const { fetchImpl } = fakeVercel(["BUILDING", "ERROR"]);
    await expect(deploy(files, vercelEnv, { fetchImpl, sleep: noSleep })).rejects.toThrow("dpl_1 ended ERROR");
  });

  it("reports Vercel's error message without the token", async () => {
    const { fetchImpl } = fakeVercel([], true);
    const err = await deploy(files, vercelEnv, { fetchImpl, sleep: noSleep }).catch((e: Error) => e);
    expect(String(err)).toContain("POST /v2/files failed (403): forbidden");
    expect(String(err)).not.toContain("tok");
  });

  it.each(["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"])("requires %s", async (name) => {
    const { fetchImpl, calls } = fakeVercel(["READY"]);
    await expect(deploy(files, { ...vercelEnv, [name]: "" }, { fetchImpl, sleep: noSleep })).rejects.toThrow(
      `${name} is not set`,
    );
    expect(calls).toEqual([]);
  });
});
