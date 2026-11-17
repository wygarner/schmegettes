// Deploys web/dist to Vercel as a production deployment, through Vercel's REST API.
// No Vercel CLI: the deploy job holds the token, so nothing but Node's standard library runs there.
// Run after `bun run --cwd web build`. The SPA fallback and security headers ship as vercel.json
// routes; each environment's origins go into the CSP, so the script fails rather than ship a policy
// that blocks the app or allows plain http.
//
// Inputs (environment): VITE_SUPABASE_URL, VITE_API_URL (https), GAME_SOCKET_ORIGIN (wss),
// VERCEL_TOKEN, VERCEL_ORG_ID (team id), VERCEL_PROJECT_ID.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.vercel.com";

/** Returns the origin of `value`, or throws if it is missing or not one of `protocols`. */
export function originOf(name, value, protocols) {
  if (!value) throw new Error(`${name} is not set`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a URL: ${value}`);
  }
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}, got ${url.protocol}`);
  }
  return url.origin;
}

/** The Content-Security-Policy for one environment. */
export function contentSecurityPolicy(env) {
  const connect = [
    originOf("VITE_SUPABASE_URL", env.VITE_SUPABASE_URL, ["https:"]),
    originOf("VITE_API_URL", env.VITE_API_URL, ["https:"]),
    originOf("GAME_SOCKET_ORIGIN", env.GAME_SOCKET_ORIGIN, ["wss:"]),
  ];
  return [
    "default-src 'self'",
    `connect-src 'self' ${[...new Set(connect)].join(" ")}`,
    "script-src 'self'",
    // Mantine renders <style> elements at runtime (MantineProvider CSS variables, InlineStyles).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** vercel.json: headers on every response, cache rules, SPA fallback. */
export function vercelConfig(env) {
  return {
    routes: [
      {
        src: "^/(.*)$",
        headers: {
          "Content-Security-Policy": contentSecurityPolicy(env),
          "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          // Players answer out loud (Web Speech API), so the page itself may use the microphone.
          "Permissions-Policy": "microphone=(self), camera=(), geolocation=()",
          // Private access: keep every response out of search engines (deployment.md).
          "X-Robots-Tag": "noindex, nofollow",
        },
        continue: true,
      },
      {
        src: "^/assets/(.*)$",
        headers: { "Cache-Control": "public, max-age=31536000, immutable" },
        continue: true,
      },
      // The deploy check reads /version.json, and index.html names the current asset hashes.
      { src: "^/(index\\.html|version\\.json)?$", headers: { "Cache-Control": "no-store" }, continue: true },
      { handle: "filesystem" },
      // A missing asset is a 404, never the app shell (which would load as the wrong type).
      { src: "^/assets/(.*)$", status: 404 },
      { src: "^/(.*)$", dest: "/index.html", headers: { "Cache-Control": "no-store" } },
    ],
  };
}

/** Every file to upload: web/dist plus the generated vercel.json, each with its SHA-1. */
export function collectFiles(distDir, env) {
  if (!existsSync(join(distDir, "index.html")) || !existsSync(join(distDir, "version.json"))) {
    throw new Error("web/dist is incomplete: run `bun run --cwd web build` first");
  }
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile())
        files.push({ file: relative(distDir, path).split(sep).join("/"), data: readFileSync(path) });
    }
  };
  walk(distDir);
  if (files.some((f) => f.file === "vercel.json")) throw new Error("web/dist must not contain vercel.json");
  files.push({ file: "vercel.json", data: Buffer.from(`${JSON.stringify(vercelConfig(env), null, 2)}\n`) });
  return files.map((f) => ({ ...f, sha: createHash("sha1").update(f.data).digest("hex"), size: f.data.length }));
}

async function call(fetchImpl, token, method, path, body, headers = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...headers },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      message = JSON.parse(text).error?.message ?? message;
    } catch {}
    throw new Error(`${method} ${path.split("?")[0]} failed (${res.status}): ${message}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Uploads `files`, creates a production deployment of the project, and waits until it is ready.
 * Returns the deployment's id and url.
 */
export async function deploy(
  files,
  env,
  { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), timeoutMs = 600_000 } = {},
) {
  for (const name of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
    if (!env[name]) throw new Error(`${name} is not set`);
  }
  const token = env.VERCEL_TOKEN;
  const team = `teamId=${encodeURIComponent(env.VERCEL_ORG_ID)}`;

  // Vercel stores files by content hash, so a file it already has uploads instantly.
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(
      files.slice(i, i + 8).map((f) =>
        call(fetchImpl, token, "POST", `/v2/files?${team}`, f.data, {
          "Content-Type": "application/octet-stream",
          "x-vercel-digest": f.sha,
        }),
      ),
    );
  }

  const created = await call(
    fetchImpl,
    token,
    "POST",
    `/v13/deployments?${team}&skipAutoDetectionConfirmation=1`,
    JSON.stringify({
      name: "schmegettes-web",
      project: env.VERCEL_PROJECT_ID,
      target: "production",
      files: files.map(({ file, sha, size }) => ({ file, sha, size })),
      // A static upload: nothing to install or build on Vercel.
      projectSettings: { framework: null, installCommand: "", buildCommand: "", outputDirectory: "." },
      meta: env.GIT_SHA ? { githubCommitSha: env.GIT_SHA } : undefined,
    }),
    { "Content-Type": "application/json" },
  );

  const deadline = Date.now() + timeoutMs;
  let state = created.readyState;
  while (state !== "READY") {
    if (state === "ERROR" || state === "CANCELED") throw new Error(`deployment ${created.id} ended ${state}`);
    if (Date.now() > deadline) throw new Error(`deployment ${created.id} not ready after ${timeoutMs / 1000} s`);
    await sleep(5_000);
    state = (await call(fetchImpl, token, "GET", `/v13/deployments/${created.id}?${team}`)).readyState;
  }
  return { id: created.id, url: created.url };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const files = collectFiles(join(webDir, "dist"), process.env);
    console.log(`Uploading ${files.length} files`);
    const { id, url } = await deploy(files, process.env);
    console.log(`Deployment ${id} is ready (https://${url}) and assigned to production`);
  } catch (err) {
    console.error(`vercel-deploy: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
