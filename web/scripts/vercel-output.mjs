// Packages web/dist for Vercel (Build Output API v3) with the SPA fallback and security headers.
// The deploy workflow runs it after `bun run --cwd web build`, then `vercel deploy --prebuilt`
// from web/. Each environment's origins go into the CSP, so the script fails rather than ship a
// policy that blocks the app or allows plain http.
//
// Inputs (environment): VITE_SUPABASE_URL, VITE_API_URL (https), GAME_SOCKET_ORIGIN (wss).

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

/** Build Output API config: headers on every response, cache rules, SPA fallback. */
export function outputConfig(env) {
  return {
    version: 3,
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

/** Writes web/.vercel/output from web/dist. */
export function writeOutput(webDir, env) {
  const config = outputConfig(env);
  const dist = join(webDir, "dist");
  if (!existsSync(join(dist, "index.html")) || !existsSync(join(dist, "version.json"))) {
    throw new Error("web/dist is incomplete: run `bun run --cwd web build` first");
  }
  const out = join(webDir, ".vercel", "output");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(dist, join(out, "static"), { recursive: true });
  writeFileSync(join(out, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const out = writeOutput(join(dirname(fileURLToPath(import.meta.url)), ".."), process.env);
    console.log(`Wrote ${out}`);
  } catch (err) {
    console.error(`vercel-output: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
