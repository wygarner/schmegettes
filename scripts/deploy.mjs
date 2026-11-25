// The one deploy implementation for staging and production. The deploy workflows call it, and so
// does an operator when GitHub Actions is unavailable; docs/system-docs/operations/deployment.md
// has the contract and the operator guide.
//
//   mise run deploy -- preflight <staging|production> [all|migrate|api|game|web]
//   mise run deploy -- run       <staging|production> <all|migrate|api|game|web>
//   mise run deploy -- verify    <staging|production> [all|api|game|web] [--sha <full sha>]
//
// Configuration comes only from the process environment (never a .env file), and secret values
// never reach output: child processes get them through their environment, and everything they
// print is redacted.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contentSecurityPolicy } from "../web/scripts/vercel-deploy.mjs";

export const ENVIRONMENTS = ["staging", "production"];
export const COMPONENTS = ["api", "game", "web"];
const RUN_SCOPES = ["all", "migrate", ...COMPONENTS];
const VERIFY_SCOPES = ["all", ...COMPONENTS];
export const ROLLBACK_REF = "docs/system-docs/operations/release-strategy.md#rollback";
export const VERIFY_TIMEOUT_MS = 15 * 60 * 1000;
export const VERIFY_INTERVAL_MS = 20 * 1000;
const SIGNING_KEYS = "supabase/signing_keys.json";

const PREFIX = { staging: "STAGING", production: "PROD" };
const SOURCE_BRANCH = { staging: "develop", production: "production" };
export const ownerUrlName = (environment) => `${PREFIX[environment]}_SUPABASE_DB_OWNER_URL`;

// Every name whose value must never be printed or handed to a step that doesn't need it.
export const SECRET_NAMES = [
  "STAGING_SUPABASE_DB_OWNER_URL",
  "PROD_SUPABASE_DB_OWNER_URL",
  "FLY_API_TOKEN_API",
  "FLY_API_TOKEN_GAME",
  "FLY_API_TOKEN",
  "VERCEL_TOKEN",
  // Telemetry (observability.md): an OTLP write token and a Grafana annotations token.
  "OTEL_EXPORTER_OTLP_HEADERS",
  "GRAFANA_ANNOTATION_TOKEN",
];

const VERSION_URL = { api: "API_VERSION_URL", game: "GAME_VERSION_URL", web: "WEB_VERSION_URL" };

/** What each scope needs: environment variables and tools on PATH. */
export function requirements(environment, scope) {
  const parts = scope === "all" ? ["migrate", ...COMPONENTS] : [scope];
  const vars = [];
  const tools = ["git"];
  for (const part of parts) {
    if (part === "migrate") {
      vars.push(ownerUrlName(environment));
      tools.push("supabase");
    }
    if (part === "api") {
      vars.push("FLY_APP_API", "FLY_API_TOKEN_API", VERSION_URL.api);
      tools.push("flyctl");
    }
    if (part === "game") {
      vars.push("FLY_APP_GAME", "FLY_API_TOKEN_GAME", VERSION_URL.game);
      tools.push("flyctl");
    }
    if (part === "web") {
      vars.push(
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "VITE_API_URL",
        "GAME_SOCKET_ORIGIN",
        "VERCEL_TOKEN",
        "VERCEL_ORG_ID",
        "VERCEL_PROJECT_ID",
        VERSION_URL.web,
      );
      tools.push("bun", "node");
    }
  }
  return { vars: [...new Set(vars)], tools: [...new Set(tools)] };
}

export const USAGE = `Deploy staging or production from this checkout (docs/system-docs/operations/deployment.md).

  mise run deploy -- preflight <staging|production> [all|migrate|api|game|web]
      Check the checkout, its branch, tools and configuration. Changes nothing.
  mise run deploy -- run <staging|production> <all|migrate|api|game|web>
      all: migrations, api, game, web, then verify all three run this commit.
      migrate: migrations only. api, game, web: that component only, then verify it.
  mise run deploy -- verify <staging|production> [all|api|game|web] [--sha <full sha>]
      Check which commit is running (default: this checkout's HEAD). Changes nothing.

The checkout must be clean. Staging deploys a commit on origin/develop; production deploys only
the current origin/production tip, checked against GitHub. Run \`git fetch origin\` first: this command
never fetches.

Configuration (process environment only; use one shell or secret-manager profile per environment):
  migrate  STAGING_SUPABASE_DB_OWNER_URL or PROD_SUPABASE_DB_OWNER_URL
  api      FLY_APP_API, FLY_API_TOKEN_API, API_VERSION_URL
  game     FLY_APP_GAME, FLY_API_TOKEN_GAME, GAME_VERSION_URL
  web      VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL, VITE_STATUS_URL (optional),
           GAME_SOCKET_ORIGIN, VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, WEB_VERSION_URL,
           VITE_FARO_URL (optional: web errors to Grafana Faro)
Optional telemetry (docs/system-docs/operations/observability.md); each is skipped when unset:
  api, game  OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS, staged as Fly secrets
  any run    GRAFANA_URL and GRAFANA_ANNOTATION_TOKEN, for a deploy annotation in Grafana

Exit status: 0 success, 1 failed (the output says what deployed), 2 usage or preflight error.`;

export class UsageError extends Error {}

export function parseArgs(argv) {
  const args = [...argv];
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return { help: true };
  let sha;
  const shaAt = args.indexOf("--sha");
  if (shaAt !== -1) {
    sha = args[shaAt + 1];
    args.splice(shaAt, 2);
    if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw new UsageError("--sha needs a full 40-character commit SHA");
  }
  const [operation, environment, scope, ...rest] = args;
  if (rest.length > 0) throw new UsageError(`unexpected argument: ${rest[0]}`);
  if (!["preflight", "run", "verify"].includes(operation)) throw new UsageError(`unknown operation: ${operation}`);
  if (!ENVIRONMENTS.includes(environment)) throw new UsageError(`environment must be staging or production`);
  if (sha && operation !== "verify") throw new UsageError("--sha is only for verify");
  if (operation === "run" && !scope) throw new UsageError("run needs a scope: all, migrate, api, game or web");
  const resolved = scope ?? "all";
  const allowed = operation === "verify" ? VERIFY_SCOPES : RUN_SCOPES;
  if (!allowed.includes(resolved)) throw new UsageError(`scope for ${operation} must be one of: ${allowed.join(", ")}`);
  return { operation, environment, scope: resolved, sha };
}

/** Replaces every secret value in `text` with ***. */
export function redactor(env) {
  const values = SECRET_NAMES.map((name) => env[name])
    .filter((value) => typeof value === "string" && value.length >= 6)
    .sort((a, b) => b.length - a.length);
  return (text) => values.reduce((out, value) => out.split(value).join("***"), String(text));
}

/** The environment a child process gets: no secrets except the ones named in `extra`. */
export function childEnv(env, extra = {}) {
  const out = { ...env };
  for (const name of SECRET_NAMES) delete out[name];
  return { ...out, ...extra };
}

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid URL)";
  }
};

function versionUrlProblems(components, env, { requireSet }) {
  const problems = [];
  for (const component of components) {
    const name = VERSION_URL[component];
    if (!env[name]) {
      if (requireSet) problems.push(`${name} is not set`);
    } else if (!/^https:\/\/[^/]+/.test(env[name])) problems.push(`${name} must be an https URL`);
  }
  return problems;
}

/** The optional telemetry settings that apply to this run, and their problems. */
export function telemetryConfig(scope, env) {
  const parts = scope === "all" ? ["migrate", ...COMPONENTS] : [scope];
  const problems = [];
  const https = (name) => {
    if (env[name] && !/^https:\/\/[^/]+/.test(env[name])) problems.push(`${name} must be an https URL`);
  };
  const fly = parts.includes("api") || parts.includes("game");
  const otel = Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_HEADERS);
  if (fly && otel && !(env.OTEL_EXPORTER_OTLP_ENDPOINT && env.OTEL_EXPORTER_OTLP_HEADERS))
    problems.push("set both OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS, or neither");
  if (fly) https("OTEL_EXPORTER_OTLP_ENDPOINT");
  if (parts.includes("web")) https("VITE_FARO_URL");
  https("GRAFANA_URL");
  return {
    flySecrets: fly && Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT && env.OTEL_EXPORTER_OTLP_HEADERS),
    faro: parts.includes("web") && Boolean(env.VITE_FARO_URL),
    annotate: Boolean(env.GRAFANA_URL && env.GRAFANA_ANNOTATION_TOKEN),
    problems,
  };
}

/** Checks that don't need git: configuration values and tools. Returns a list of problems. */
export function checkConfig(environment, scope, env, hasTool) {
  const { vars, tools } = requirements(environment, scope);
  const problems = [];
  for (const name of vars) if (!env[name]) problems.push(`${name} is not set`);
  problems.push(...telemetryConfig(scope, env).problems);
  problems.push(
    ...versionUrlProblems(
      COMPONENTS.filter((c) => vars.includes(VERSION_URL[c])),
      env,
      { requireSet: false },
    ),
  );
  // The web deploy builds its CSP from these origins; check them now rather than after migrations.
  if (vars.includes("GAME_SOCKET_ORIGIN") && env.VITE_SUPABASE_URL && env.VITE_API_URL && env.GAME_SOCKET_ORIGIN) {
    try {
      contentSecurityPolicy(env);
    } catch (error) {
      problems.push(error.message);
    }
  }
  for (const tool of tools)
    if (!hasTool(tool)) problems.push(`${tool} is not on PATH (run through \`mise run deploy\`)`);
  return problems;
}

/** Checks the checkout: clean, and the right commit for the environment. Returns { sha, problems }. */
export async function checkCheckout(environment, git) {
  const problems = [];
  const head = await git(["rev-parse", "HEAD"]);
  const sha = head.code === 0 ? head.stdout.trim() : "";
  if (!/^[0-9a-f]{40}$/.test(sha)) return { sha: "", problems: ["not a git checkout with a commit"] };

  const status = await git(["status", "--porcelain", "--untracked-files=normal"]);
  if (status.code !== 0 || status.stdout.trim() !== "")
    problems.push("the checkout has uncommitted or untracked changes");

  const branch = SOURCE_BRANCH[environment];
  const tracking = await git(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]);
  const local = tracking.code === 0 ? tracking.stdout.trim() : "";
  if (!local) {
    problems.push(`origin/${branch} is missing; run \`git fetch origin\``);
    return { sha, problems };
  }
  if (environment === "production") {
    // Production deploys only the current tip, so a stale local ref is an error.
    const remote = await git(["ls-remote", "origin", `refs/heads/${branch}`]);
    const remoteTip = remote.code === 0 ? remote.stdout.trim().split(/\s+/)[0] : "";
    if (!remoteTip) problems.push(`could not read origin's ${branch} branch`);
    else if (remoteTip !== local) problems.push(`origin/${branch} is stale; run \`git fetch origin\``);
    if (sha !== local) problems.push("production deploys only the current origin/production tip; check it out exactly");
  } else {
    // Staging deploys any commit on develop. A local origin/develop that lags GitHub's is still
    // develop history (the branch is protected against force pushes), so it isn't an error: when
    // several merges land together, each queued deploy run checks out a slightly older develop.
    const ancestor = await git(["merge-base", "--is-ancestor", sha, local]);
    if (ancestor.code !== 0) problems.push("staging deploys only a commit on origin/develop");
  }
  return { sha, problems };
}

/** Polls the version URLs until every one reports `sha`. Returns { ok, last } with each URL's last commit. */
export async function verifyVersions(
  urls,
  sha,
  { fetchImpl, sleep, now, timeoutMs = VERIFY_TIMEOUT_MS, intervalMs = VERIFY_INTERVAL_MS },
) {
  const deadline = now() + timeoutMs;
  const last = {};
  for (;;) {
    let waiting = false;
    for (const [component, url] of Object.entries(urls)) {
      let commit = "unreachable";
      try {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { "cache-control": "no-cache" },
        });
        if (!response.ok) commit = `HTTP ${response.status}`;
        else {
          const body = await response.json().catch(() => undefined);
          commit = typeof body?.commit === "string" ? body.commit : "invalid response";
        }
      } catch {
        commit = "unreachable";
      }
      last[component] = commit;
      if (commit !== sha) waiting = true;
    }
    if (!waiting) return { ok: true, last };
    if (now() + intervalMs > deadline) return { ok: false, last };
    await sleep(intervalMs);
  }
}

/** The steps of one run, in order. */
export function plan(scope) {
  if (scope === "all") return ["migrate", "api", "game", "web", "verify"];
  if (scope === "migrate") return ["migrate"];
  return [scope, "verify"];
}

export async function main(argv, deps) {
  const { env, out, err } = deps;
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    err(`deploy: ${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (parsed.help) {
    out(USAGE);
    return 0;
  }
  const { operation, environment, scope } = parsed;
  const redact = redactor(env);
  const say = (line) => out(redact(line));
  const git = (args) => deps.runner.capture("git", args, { cwd: deps.root, env: childEnv(env) });

  if (operation === "verify") {
    const components = scope === "all" ? COMPONENTS : [scope];
    const problems = versionUrlProblems(components, env, { requireSet: true });
    let sha = parsed.sha;
    if (!sha) {
      const head = await git(["rev-parse", "HEAD"]);
      sha = head.code === 0 ? head.stdout.trim() : "";
      if (!/^[0-9a-f]{40}$/.test(sha)) problems.push("no commit to expect: not a git checkout (pass --sha)");
    }
    if (problems.length > 0) {
      err(`Verify not started:\n${problems.map((p) => `  ✖ ${p}`).join("\n")}`);
      return 2;
    }
    say(`deploy verify ${environment} ${scope}: expecting ${sha}`);
    const result = await verifyVersions(Object.fromEntries(components.map((c) => [c, env[VERSION_URL[c]]])), sha, deps);
    for (const component of components)
      say(
        `  ${result.last[component] === sha ? "✔" : "✖"} ${component} (${hostOf(env[VERSION_URL[component]])}): ${result.last[component]}`,
      );
    return result.ok ? 0 : 1;
  }

  // preflight and run share every check; preflight stops here.
  const checkout = await checkCheckout(environment, git);
  const problems = [...checkout.problems, ...checkConfig(environment, scope, env, deps.hasTool)];
  say(`deploy ${operation} ${environment} ${scope}`);
  say(`  commit   ${checkout.sha || "(none)"}`);
  const { vars } = requirements(environment, scope);
  if (vars.includes("FLY_APP_API") && env.FLY_APP_API) say(`  api      Fly app ${env.FLY_APP_API}`);
  if (vars.includes("FLY_APP_GAME") && env.FLY_APP_GAME) say(`  game     Fly app ${env.FLY_APP_GAME}`);
  if (vars.includes("VERCEL_PROJECT_ID") && env.VERCEL_PROJECT_ID)
    say(`  web      Vercel project ${env.VERCEL_PROJECT_ID}`);
  for (const component of COMPONENTS) {
    if (vars.includes(VERSION_URL[component]) && env[VERSION_URL[component]])
      say(`  verify   ${component} at ${hostOf(env[VERSION_URL[component]])}`);
  }
  const telemetry = telemetryConfig(scope, env);
  if (vars.includes("FLY_APP_API") || vars.includes("FLY_APP_GAME"))
    say(
      `  otel     ${telemetry.flySecrets ? `staged on the Fly apps (${hostOf(env.OTEL_EXPORTER_OTLP_ENDPOINT)})` : "not configured; skipped"}`,
    );
  if (vars.includes("VERCEL_PROJECT_ID"))
    say(`  faro     ${telemetry.faro ? `on (${hostOf(env.VITE_FARO_URL)})` : "not configured; off"}`);
  say(`  annotate ${telemetry.annotate ? `Grafana at ${hostOf(env.GRAFANA_URL)}` : "not configured; skipped"}`);
  say(`  steps    ${plan(scope).join(" → ")}`);
  if (problems.length > 0) {
    err(redact(`Preflight failed; nothing was changed:\n${problems.map((p) => `  ✖ ${p}`).join("\n")}`));
    return 2;
  }
  if (operation === "preflight") {
    say("Preflight passed; nothing was changed.");
    return 0;
  }
  return runSteps(environment, scope, checkout.sha, deps, say);
}

async function runSteps(environment, scope, sha, deps, say) {
  const { env, runner, root } = deps;
  const redact = redactor(env);
  const steps = plan(scope);
  const state = Object.fromEntries(steps.map((step) => [step, "not started"]));
  const exec = (command, args, extra = {}, input) =>
    runner.run(command, args, { cwd: root, env: childEnv(env, extra), redact, input });
  const telemetry = telemetryConfig(scope, env);

  const deployFly = async (component) => {
    const app = component === "api" ? env.FLY_APP_API : env.FLY_APP_GAME;
    const token = component === "api" ? env.FLY_API_TOKEN_API : env.FLY_API_TOKEN_GAME;
    if (telemetry.flySecrets) {
      // Staged, so the deploy below applies them. Values go on stdin, never in arguments.
      const lines = `OTEL_EXPORTER_OTLP_ENDPOINT=${env.OTEL_EXPORTER_OTLP_ENDPOINT}\nOTEL_EXPORTER_OTLP_HEADERS=${env.OTEL_EXPORTER_OTLP_HEADERS}\n`;
      say(`  staging telemetry secrets on ${app}`);
      const staged = await exec(
        "flyctl",
        ["secrets", "import", "--stage", "--app", app],
        { FLY_API_TOKEN: token },
        lines,
      );
      if (staged !== 0) return staged;
    }
    const args = ["deploy", ".", "--config", `${component}/fly.toml`, "--dockerfile", `${component}/Dockerfile`];
    args.push("--app", app, "--remote-only", "--build-arg", `GIT_SHA=${sha}`, "--image-label", sha);
    args.push("--env", `APP_ENV=${environment}`);
    // game runs on exactly one machine (game/fly.toml explains why).
    if (component === "game") args.push("--ha=false");
    args.push("--wait-timeout", "10m");
    return exec("flyctl", args, { FLY_API_TOKEN: token });
  };

  const actions = {
    migrate: async () => {
      // supabase/config.toml points at a git-ignored local signing key, and the CLI won't load the
      // config without the file. A throwaway key made here is never sent anywhere; an existing
      // developer key is left alone.
      const keyPath = join(root, SIGNING_KEYS);
      const created = !deps.fs.exists(keyPath);
      try {
        if (created) {
          deps.fs.write(keyPath, "[]\n");
          const key = await runner.capture("supabase", ["gen", "signing-key", "--algorithm", "ES256", "--yes"], {
            cwd: root,
            env: childEnv(env),
          });
          if (key.code !== 0) return key.code || 1;
        }
        // Migrations must work with the code already running (additive only; deployment.md).
        return await exec("supabase", ["db", "push", "--db-url", env[ownerUrlName(environment)], "--include-all"]);
      } finally {
        if (created && deps.fs.exists(keyPath)) deps.fs.remove(keyPath);
      }
    },
    api: () => deployFly("api"),
    game: () => deployFly("game"),
    web: async () => {
      const install = await exec("bun", ["install", "--frozen-lockfile"]);
      if (install !== 0) return install;
      const build = await exec("bun", ["run", "--cwd", "web", "build"], {
        // "staging" lets the end-to-end suite turn on E2E mode (?e2e=1); "production" compiles it out.
        VITE_ENV: environment,
        GIT_SHA: sha,
      });
      if (build !== 0) return build;
      return exec("node", ["web/scripts/vercel-deploy.mjs"], { VERCEL_TOKEN: env.VERCEL_TOKEN, GIT_SHA: sha });
    },
    verify: async () => {
      const components = scope === "all" ? COMPONENTS : [scope];
      const urls = Object.fromEntries(components.map((c) => [c, env[VERSION_URL[c]]]));
      const result = await verifyVersions(urls, sha, deps);
      for (const component of components)
        say(
          `  ${result.last[component] === sha ? "✔" : "✖"} ${component} (${hostOf(urls[component])}): ${result.last[component]}`,
        );
      return result.ok ? 0 : 1;
    },
  };

  // A deploy marker in Grafana, on success or failure. Never fails the deploy.
  const annotate = async (failedStep) => {
    if (!telemetry.annotate) return;
    const subject = await runner.capture("git", ["log", "-1", "--format=%s", sha], { cwd: root, env: childEnv(env) });
    const text = `${sha.slice(0, 7)} ${subject.code === 0 ? subject.stdout.trim() : ""}`.trim();
    const tags = ["deploy", environment, scope];
    if (failedStep) tags.push("failed", `failed:${failedStep}`);
    try {
      const response = await deps.fetchImpl(`${env.GRAFANA_URL.replace(/\/+$/, "")}/api/annotations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.GRAFANA_ANNOTATION_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tags, text: failedStep ? `${text} (failed at ${failedStep})` : text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) say(`  ⚠ deploy annotation not written (HTTP ${response.status}); the deploy is unaffected`);
      else say("  deploy annotation written to Grafana");
    } catch (error) {
      say(`  ⚠ deploy annotation not written (${error.message}); the deploy is unaffected`);
    }
  };

  for (const step of steps) {
    const started = deps.now();
    say(`▶ ${step}`);
    let code;
    try {
      code = await actions[step]();
    } catch (error) {
      say(`  ${step}: ${error.message}`);
      code = 1;
    }
    const seconds = Math.round((deps.now() - started) / 1000);
    if (code !== 0) {
      state[step] = "failed";
      say(`✖ ${step} failed (exit ${code}, ${seconds}s)`);
      summarize(environment, scope, sha, state, say);
      await annotate(step);
      return 1;
    }
    state[step] = "done";
    say(`✔ ${step} (${seconds}s)`);
  }

  await annotate();
  if (scope === "all") say(`Deployed ${sha} to ${environment}: migrations, api, game and web all verified.`);
  else if (scope === "migrate") say(`Migrations applied to ${environment} from ${sha}. No service was deployed.`);
  else {
    say(`Deployed ${scope} at ${sha} to ${environment} and verified it.`);
    say(
      `Only ${scope} changed: the other components may run other commits. Check with \`mise run deploy -- verify ${environment} all\`.`,
    );
  }
  return 0;
}

function summarize(environment, scope, sha, state, say) {
  say("");
  say(`Deploy of ${sha} to ${environment} (${scope}) did NOT complete:`);
  for (const [step, status] of Object.entries(state))
    say(`  ${status === "done" ? "✔" : status === "failed" ? "✖" : "·"} ${step}: ${status}`);
  const deployed = COMPONENTS.filter((c) => state[c] === "done");
  if (state.migrate === "done") say("Migrations were applied (they are additive and are not rolled back).");
  if (deployed.length > 0) {
    say(`${deployed.join(", ")} now run ${sha}; the rest of ${environment} may run an older commit.`);
  } else if (state.migrate === "failed") {
    say("No service was deployed.");
  }
  say(`Do not treat ${environment} as deployed. To restore a component: ${ROLLBACK_REF}`);
}

// ---------------------------------------------------------------------------------------------
// Real dependencies.

function onPath(tool, env) {
  return (env.PATH ?? "").split(delimiter).some((dir) => dir && existsSync(join(dir, tool)));
}

function lineRedactingPipe(stream, write, redact) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) write(`${redact(line)}\n`);
  });
  stream.on("end", () => {
    if (buffer) write(redact(buffer));
  });
}

export const realRunner = {
  capture(command, args, { cwd, env }) {
    const result = spawnSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: result.status ?? 1, stdout: result.stdout ?? "" };
  },
  run(command, args, { cwd, env, redact, input }) {
    return new Promise((resolve) => {
      // input (secret values, for example) goes to the child's stdin and is never printed.
      const child = spawn(command, args, {
        cwd,
        env,
        stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"],
      });
      if (input !== undefined) child.stdin.end(input);
      lineRedactingPipe(child.stdout, (text) => process.stdout.write(text), redact);
      lineRedactingPipe(child.stderr, (text) => process.stderr.write(text), redact);
      child.on("error", () => resolve(127));
      child.on("close", (code) => resolve(code ?? 1));
    });
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const code = await main(process.argv.slice(2), {
    env: process.env,
    root,
    runner: realRunner,
    hasTool: (tool) => onPath(tool, process.env),
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    fs: { exists: existsSync, write: (path, text) => writeFileSync(path, text), remove: unlinkSync },
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
  process.exitCode = code;
}
