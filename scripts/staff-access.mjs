#!/usr/bin/env node
// Time-limited staff access to one player, room, or game, through the api's admin routes
// (docs/system-docs/operations/operator-scripts.md). The database records each grant, read,
// and revocation in private.audit_log, and every grant alerts the admin.
//
// Usage: node scripts/staff-access.mjs --env staging|production|local grant <user|room|game> <id> --reason "…" [--minutes 60]
//        node scripts/staff-access.mjs --env … read <grantId>
//        node scripts/staff-access.mjs --env … revoke <grantId>
//        node scripts/staff-access.mjs --env … audit [--since 2026-11-21T00:00:00Z] [--action staff_read] [--subject <id>]
//
// Asks for the admin's email and password (not echoed, never stored), signs in to that
// environment's Supabase Auth, and prints the api's JSON. The Supabase URL, public anon key,
// and api URL come from VITE_{ENV}_SUPABASE_URL, VITE_{ENV}_SUPABASE_ANON_KEY and
// VITE_{ENV}_API_URL: the process environment first, then devtools/.env.local (the Admin page's
// settings).
// Test:  node --test scripts/staff-access.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAX_MINUTES = 480;
export const DEFAULT_MINUTES = 60;
const ENVS = ["local", "staging", "production"];
const SUBJECTS = ["user", "room", "game"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USAGE = `usage: staff-access.mjs --env staging|production|local <command>
  grant <user|room|game> <id> --reason "…" [--minutes ${DEFAULT_MINUTES}]   (at most ${MAX_MINUTES} minutes)
  read <grantId>
  revoke <grantId>
  audit [--since <RFC 3339 time>] [--action <action>] [--subject <id>]`;

export class UsageError extends Error {}

// Parses argv (without node and the script) into a request. Throws UsageError.
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
      const value = inline ?? argv[++i];
      if (value === undefined) throw new UsageError(`--${name} needs a value`);
      flags[name] = value;
    } else {
      positional.push(arg);
    }
  }
  const allowed = {
    grant: ["env", "reason", "minutes"],
    read: ["env"],
    revoke: ["env"],
    audit: ["env", "since", "action", "subject"],
  };
  const [command, ...rest] = positional;
  if (!allowed[command]) throw new UsageError(command ? `unknown command ${command}` : "no command");
  for (const name of Object.keys(flags)) {
    if (!allowed[command].includes(name)) throw new UsageError(`--${name} doesn't apply to ${command}`);
  }
  if (!ENVS.includes(flags.env)) throw new UsageError("--env must be staging, production, or local");

  const env = flags.env;
  if (command === "grant") {
    const [subjectType, subjectId, ...extra] = rest;
    if (!SUBJECTS.includes(subjectType)) throw new UsageError("grant needs a subject type: user, room, or game");
    if (!UUID.test(subjectId ?? "")) throw new UsageError("grant needs the subject's id (a UUID)");
    if (extra.length) throw new UsageError(`unexpected ${extra.join(" ")}`);
    const reason = (flags.reason ?? "").trim();
    if (!reason) throw new UsageError("grant needs --reason");
    if ([...reason].length > 200) throw new UsageError("--reason is at most 200 characters");
    const minutes = flags.minutes === undefined ? DEFAULT_MINUTES : Number(flags.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
      throw new UsageError(`--minutes must be a whole number from 1 to ${MAX_MINUTES}`);
    }
    return { env, command, subjectType, subjectId, reason, minutes };
  }
  if (command === "audit") {
    if (rest.length) throw new UsageError(`unexpected ${rest.join(" ")}`);
    if (flags.subject !== undefined && !UUID.test(flags.subject)) throw new UsageError("--subject must be a UUID");
    if (flags.since !== undefined && Number.isNaN(Date.parse(flags.since)))
      throw new UsageError("--since must be a time");
    return { env, command, since: flags.since, action: flags.action, subject: flags.subject };
  }
  const [grantId, ...extra] = rest;
  if (!UUID.test(grantId ?? "")) throw new UsageError(`${command} needs a grant id (a UUID)`);
  if (extra.length) throw new UsageError(`unexpected ${extra.join(" ")}`);
  return { env, command, grantId };
}

// The api call for a parsed request.
export function apiRequest(req) {
  switch (req.command) {
    case "grant":
      return {
        method: "POST",
        path: "/v1/admin/staff-access",
        body: { subjectType: req.subjectType, subjectId: req.subjectId, reason: req.reason, minutes: req.minutes },
      };
    case "read":
      return { method: "GET", path: `/v1/admin/staff-access/${req.grantId}` };
    case "revoke":
      return { method: "DELETE", path: `/v1/admin/staff-access/${req.grantId}` };
    case "audit": {
      const q = new URLSearchParams();
      for (const k of ["since", "action", "subject"]) if (req[k] !== undefined) q.set(k, req[k]);
      const qs = q.toString();
      return { method: "GET", path: `/v1/admin/audit${qs ? `?${qs}` : ""}` };
    }
  }
  throw new Error(`unknown command ${req.command}`);
}

// Reads KEY=value lines; a missing file is empty.
export function parseDotenv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

export function loadConfig(env, processEnv, dotenvText) {
  const file = parseDotenv(dotenvText);
  const key = (name) => {
    const full = `VITE_${env.toUpperCase()}_${name}`;
    const value = processEnv[full] || file[full];
    if (!value) throw new UsageError(`${full} isn't set (environment or devtools/.env.local)`);
    return value;
  };
  return { supabaseUrl: key("SUPABASE_URL"), anonKey: key("SUPABASE_ANON_KEY"), apiUrl: key("API_URL") };
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY });
    if (hidden) {
      // Print the prompt, then swallow everything readline would echo.
      process.stderr.write(question);
      rl._writeToOutput = () => {};
    }
    rl.question(hidden ? "" : question, (answer) => {
      rl.close();
      if (hidden) process.stderr.write("\n");
      resolve(answer);
    });
    rl.on("SIGINT", () => {
      rl.close();
      reject(new Error("cancelled"));
    });
  });
}

async function signIn(config, email, password) {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed (${res.status})`);
  const { access_token: token } = await res.json();
  if (!token) throw new Error("sign-in returned no access token");
  return token;
}

async function main() {
  let req;
  try {
    req = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`${err.message}\n${USAGE}`);
    process.exit(2);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  let dotenv = "";
  try {
    dotenv = readFileSync(join(root, "devtools/.env.local"), "utf8");
  } catch {
    // No file: the process environment must have the values.
  }
  const config = loadConfig(req.env, process.env, dotenv);

  const email = (await ask(`Admin email (${req.env}): `)).trim();
  const password = await ask("Password: ", { hidden: true });
  const token = await signIn(config, email, password);

  const call = apiRequest(req);
  const res = await fetch(`${config.apiUrl}${call.path}`, {
    method: call.method,
    headers: { Authorization: `Bearer ${token}`, ...(call.body ? { "Content-Type": "application/json" } : {}) },
    body: call.body ? JSON.stringify(call.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`${call.method} ${call.path} → ${res.status}`);
    if (text) console.error(text);
    process.exit(1);
  }
  console.log(text ? JSON.stringify(JSON.parse(text), null, 2) : `${res.status} ${res.statusText}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
