#!/usr/bin/env node
// Provision and clean up the seven dedicated QA accounts. Passwords are printed once and are
// never written to disk. Configuration is shared with devtools/.env.local.
// Test: node --test scripts/qa-accounts.test.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENVS = ["local", "staging", "production"];
const USAGE = `usage: qa-accounts.mjs --env local|staging|production <command>
  create
  list
  cleanup [--older-than-hours N] [--apply] [--yes]

Cleanup is a dry run unless --apply is present. Production --apply also requires --yes.`;

export class UsageError extends Error {}

export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply" || arg === "--yes") {
      flags[arg.slice(2)] = true;
    } else if (arg.startsWith("--")) {
      const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
      const value = inline ?? argv[++i];
      if (value === undefined) throw new UsageError(`--${name} needs a value`);
      flags[name] = value;
    } else {
      positional.push(arg);
    }
  }
  const [command, ...extra] = positional;
  if (!ENVS.includes(flags.env)) throw new UsageError("--env must be local, staging, or production");
  if (!["create", "list", "cleanup"].includes(command)) {
    throw new UsageError(command ? `unknown command ${command}` : "no command");
  }
  if (extra.length) throw new UsageError(`unexpected ${extra.join(" ")}`);
  const allowed = command === "cleanup" ? ["env", "older-than-hours", "apply", "yes"] : ["env"];
  for (const name of Object.keys(flags)) {
    if (!allowed.includes(name)) throw new UsageError(`--${name} doesn't apply to ${command}`);
  }
  if (flags.yes && !flags.apply) throw new UsageError("--yes requires --apply");
  if (command !== "cleanup") return { env: flags.env, command };

  const defaultHours = flags.env === "production" ? 24 : 0;
  const olderThanHours = flags["older-than-hours"] === undefined ? defaultHours : Number(flags["older-than-hours"]);
  if (!Number.isInteger(olderThanHours) || olderThanHours < 0 || olderThanHours > 8760) {
    throw new UsageError("--older-than-hours must be a whole number from 0 to 8760");
  }
  const dryRun = !flags.apply;
  if (flags.env === "production" && !dryRun && !flags.yes) {
    throw new UsageError("production --apply requires --yes");
  }
  return { env: flags.env, command, olderThanHours, dryRun };
}

export function parseDotenv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

export function loadConfig(env, processEnv, dotenvText) {
  const file = parseDotenv(dotenvText);
  const key = (name, fallback) => {
    const full = `VITE_${env.toUpperCase()}_${name}`;
    const value = processEnv[full] || file[full] || fallback;
    if (!value) throw new UsageError(`${full} isn't set (environment or devtools/.env.local)`);
    return value;
  };
  const domain = key("QA_ACCOUNT_DOMAIN", env === "local" ? "example.test" : "").replace(/^@/, "");
  if (!/^[a-z0-9.-]+$/i.test(domain) || !domain.includes(".")) {
    throw new UsageError(`VITE_${env.toUpperCase()}_QA_ACCOUNT_DOMAIN must be a domain`);
  }
  return {
    supabaseUrl: key("SUPABASE_URL"),
    anonKey: key("SUPABASE_ANON_KEY"),
    apiUrl: key("API_URL"),
    domain,
  };
}

export function accountManifest(domain) {
  return [
    { email: `qa-host@${domain}`, role: "host", label: "QA Host" },
    ...Array.from({ length: 6 }, (_, i) => ({
      email: `qa-${i + 1}@${domain}`,
      role: "contestant",
      label: `QA ${i + 1}`,
    })),
  ];
}

export function cleanupRequest(req) {
  return {
    method: "POST",
    path: "/v1/admin/qa-cleanup",
    body: { olderThanHours: req.olderThanHours, dryRun: req.dryRun },
  };
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY });
    if (hidden) {
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

async function json(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`server returned invalid JSON (${res.status})`);
  }
}

async function signUp(config, email, password) {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await json(res);
  if (!res.ok) {
    const alreadyExists =
      res.status === 422 &&
      (body.code === "user_already_exists" || /already (been )?registered/i.test(body.msg ?? body.message ?? ""));
    if (alreadyExists) return null;
    throw new Error(`sign-up failed for ${email} (${res.status})`);
  }
  const id = body.user?.id;
  if (!id) throw new Error(`sign-up returned no user id for ${email}`);
  return id;
}

async function signIn(config, email, password) {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await json(res);
  if (!res.ok || !body.access_token) throw new Error(`admin sign-in failed (${res.status})`);
  return body.access_token;
}

async function adminCall(config, token, request) {
  const res = await fetch(`${config.apiUrl}${request.path}`, {
    method: request.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
  });
  const body = await json(res);
  if (!res.ok) throw new Error(`${request.method} ${request.path} failed (${res.status})`);
  return body;
}

async function adminToken(config, env) {
  const email = (await ask(`Admin email (${env}): `)).trim();
  const password = await ask("Password: ", { hidden: true });
  return signIn(config, email, password);
}

async function create(config, env) {
  const created = [];
  for (const account of accountManifest(config.domain)) {
    const password = randomBytes(24).toString("base64url");
    const userId = await signUp(config, account.email, password);
    if (userId) created.push({ ...account, password, userId });
    else console.log(`Already exists; skipped: ${account.label} (${account.email})`);
  }
  if (created.length === 0) {
    console.log("No accounts created; existing QA accounts were left unchanged.");
    return;
  }
  console.log("\nSave these passwords now; they will not be shown again:");
  for (const account of created) console.log(`${account.label}\t${account.email}\t${account.password}`);
  const token = await adminToken(config, env);
  await adminCall(config, token, {
    method: "POST",
    path: "/v1/admin/qa-accounts",
    body: { accounts: created.map(({ userId, role, label }) => ({ userId, role, label })) },
  });
  console.log(`Marked ${created.length} account(s) as QA.`);
}

async function cleanup(config, req) {
  const token = await adminToken(config, req.env);
  const body = await adminCall(config, token, cleanupRequest(req));
  const counts = { game: 0, room: 0 };
  for (const item of body.removed ?? []) counts[item.kind]++;
  console.log(`${req.dryRun ? "Would remove" : "Removed"}: ${counts.game} game(s), ${counts.room} room(s).`);
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
    // The process environment may carry every value.
  }
  const config = loadConfig(req.env, process.env, dotenv);
  if (req.command === "list") {
    for (const account of accountManifest(config.domain))
      console.log(`${account.label}\t${account.role}\t${account.email}`);
  } else if (req.command === "create") {
    await create(config, req.env);
  } else {
    await cleanup(config, req);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
