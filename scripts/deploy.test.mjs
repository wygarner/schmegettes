// Run with: node --test scripts/deploy.test.mjs
// Every boundary is faked: git, child processes, filesystem, fetch and the clock. Nothing here
// reaches Supabase, Fly.io, Vercel or a hosted database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkConfig,
  childEnv,
  main,
  parseArgs,
  plan,
  ROLLBACK_REF,
  redactor,
  requirements,
  UsageError,
  VERIFY_TIMEOUT_MS,
  verifyVersions,
} from "./deploy.mjs";

const ROOT = "/repo";
const SHA = "a".repeat(40);
const DEVELOP_TIP = "b".repeat(40);
const OLD = "c".repeat(40);

// Unmistakably fake credentials; every test asserts none of them is printed.
const SECRETS = {
  STAGING_SUPABASE_DB_OWNER_URL: "postgresql://postgres:FAKE-staging-db-pass@db.fake.test:5432/postgres",
  PROD_SUPABASE_DB_OWNER_URL: "postgresql://postgres:FAKE-prod-db-pass@db.fake.test:5432/postgres",
  FLY_API_TOKEN_API: "FAKE-fly-api-token-1234567890",
  FLY_API_TOKEN_GAME: "FAKE-fly-game-token-1234567890",
  VERCEL_TOKEN: "FAKE-vercel-token-1234567890",
  OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Basic%20FAKE-otlp-token-1234567890",
  GRAFANA_ANNOTATION_TOKEN: "FAKE-grafana-annotation-token-1234567890",
};

// Telemetry is optional: CONFIG leaves it out, TELEMETRY adds it.
const TELEMETRY = {
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.fake.test/otlp",
  VITE_FARO_URL: "https://faro.fake.test/collect/app-key",
  GRAFANA_URL: "https://stack.fake.test/",
};

const { OTEL_EXPORTER_OTLP_HEADERS: _otlp, GRAFANA_ANNOTATION_TOKEN: _annotation, ...BASE_SECRETS } = SECRETS;

const CONFIG = {
  PATH: "/bin",
  ...BASE_SECRETS,
  FLY_APP_API: "schmegettes-api-staging",
  FLY_APP_GAME: "schmegettes-game-staging",
  VITE_SUPABASE_URL: "https://fake.supabase.test",
  VITE_SUPABASE_ANON_KEY: "public-anon-key",
  VITE_API_URL: "https://api.fake.test",
  GAME_SOCKET_ORIGIN: "wss://game.fake.test",
  VERCEL_ORG_ID: "team_fake",
  VERCEL_PROJECT_ID: "prj_fake",
  WEB_VERSION_URL: "https://web.fake.test/version.json",
  API_VERSION_URL: "https://api.fake.test/version",
  GAME_VERSION_URL: "https://game.fake.test/version",
};

function harness({
  env = CONFIG,
  environment = "staging",
  head = SHA,
  dirty = "",
  tip = environment === "production" ? SHA : DEVELOP_TIP,
  remoteTip = tip,
  ancestor = true,
  tools = ["git", "supabase", "flyctl", "bun", "node"],
  runCode = () => 0,
  versions = () => SHA,
  annotation = () => 200,
  files = [],
} = {}) {
  const branch = environment === "production" ? "production" : "develop";
  const calls = [];
  const output = [];
  const fsFiles = new Set(files);
  const fsLog = [];
  let clock = 0;
  const git = (args) => {
    const key = args.join(" ");
    calls.push({ kind: "git", args });
    if (key === "rev-parse HEAD") return { code: head ? 0 : 128, stdout: `${head}\n` };
    if (key.startsWith("status")) return { code: 0, stdout: dirty };
    if (key === `rev-parse --verify --quiet refs/remotes/origin/${branch}`)
      return tip ? { code: 0, stdout: `${tip}\n` } : { code: 1, stdout: "" };
    if (key === `ls-remote origin refs/heads/${branch}`)
      return { code: 0, stdout: remoteTip ? `${remoteTip}\trefs/heads/${branch}\n` : "" };
    if (key.startsWith("merge-base --is-ancestor")) return { code: ancestor ? 0 : 1, stdout: "" };
    if (key === `log -1 --format=%s ${head}`) return { code: 0, stdout: "Add the scoreboard (#42)\n" };
    throw new Error(`unexpected git ${key}`);
  };
  const deps = {
    env,
    root: ROOT,
    runner: {
      capture: async (command, args, options) => {
        if (command === "git") return git(args);
        calls.push({ kind: "capture", command, args, env: options.env });
        return { code: 0, stdout: "FAKE-generated-signing-key" };
      },
      run: async (command, args, options) => {
        const call = { kind: "run", command, args, env: options.env, input: options.input };
        calls.push(call);
        return runCode(call);
      },
    },
    hasTool: (tool) => tools.includes(tool),
    fetchImpl: async (url, options) => {
      calls.push({ kind: "fetch", url, options });
      if (url.endsWith("/api/annotations")) {
        const status = annotation(url, options);
        if (status instanceof Error) throw status;
        return { ok: status < 300, status, json: async () => ({}) };
      }
      const value = versions(url);
      if (value instanceof Error) throw value;
      if (typeof value === "number") return { ok: false, status: value, json: async () => ({}) };
      if (value === "garbage") return { ok: true, status: 200, json: async () => JSON.parse("{") };
      return { ok: true, status: 200, json: async () => ({ commit: value }) };
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    fs: {
      exists: (path) => fsFiles.has(path),
      write: (path) => {
        fsLog.push(`write ${path}`);
        fsFiles.add(path);
      },
      remove: (path) => {
        fsLog.push(`remove ${path}`);
        fsFiles.delete(path);
      },
    },
    out: (line) => output.push(line),
    err: (line) => output.push(line),
  };
  const run = async (...argv) => {
    const code = await main(argv, deps);
    const text = output.join("\n");
    for (const value of Object.values(SECRETS)) assert.ok(!text.includes(value), `output leaked a secret: ${value}`);
    return { code, text };
  };
  const runs = () => calls.filter((c) => c.kind === "run" || c.kind === "capture");
  const mutating = () => runs().length + fsLog.length;
  return { run, calls, runs, mutating, fsLog, fsFiles };
}

const stepOrder = (h) =>
  h.runs().map((c) => (c.command === "flyctl" ? `fly:${c.args[3].split("/")[0]}` : `${c.command}:${c.args[0]}`));

// --- arguments --------------------------------------------------------------------------------

test("parseArgs accepts each operation and fills the default scope", () => {
  assert.deepEqual(parseArgs(["preflight", "staging"]), {
    operation: "preflight",
    environment: "staging",
    scope: "all",
    sha: undefined,
  });
  assert.deepEqual(parseArgs(["run", "production", "api"]), {
    operation: "run",
    environment: "production",
    scope: "api",
    sha: undefined,
  });
  assert.deepEqual(parseArgs(["verify", "staging", "web", "--sha", SHA]), {
    operation: "verify",
    environment: "staging",
    scope: "web",
    sha: SHA,
  });
  assert.deepEqual(parseArgs(["--help"]), { help: true });
  assert.deepEqual(parseArgs([]), { help: true });
});

test("parseArgs rejects unknown environments, scopes and operations", () => {
  for (const argv of [
    ["run", "prod", "all"],
    ["run", "staging"],
    ["run", "staging", "worker"],
    ["verify", "staging", "migrate"],
    ["deploy", "staging", "all"],
    ["run", "staging", "all", "--sha", SHA],
    ["verify", "staging", "all", "--sha", "abc"],
    ["run", "staging", "all", "extra"],
  ]) {
    assert.throws(() => parseArgs(argv), UsageError, argv.join(" "));
  }
});

test("--help prints usage and changes nothing; a bad argument exits 2", async () => {
  const h = harness();
  const help = await h.run("--help");
  assert.equal(help.code, 0);
  assert.match(help.text, /mise run deploy -- run <staging\|production>/);
  assert.equal((await harness().run("run", "qa", "all")).code, 2);
  assert.equal(h.mutating(), 0);
});

// --- preflight --------------------------------------------------------------------------------

test("preflight passes with zero mutating calls and prints environment, scope, commit and targets", async () => {
  const h = harness();
  const { code, text } = await h.run("preflight", "staging", "all");
  assert.equal(code, 0);
  assert.equal(h.mutating(), 0);
  assert.ok(!h.calls.some((c) => c.kind === "fetch"));
  assert.match(text, /deploy preflight staging all/);
  assert.match(text, new RegExp(`commit {3}${SHA}`));
  assert.match(text, /Fly app schmegettes-api-staging/);
  assert.match(text, /migrate → api → game → web → verify/);
  assert.match(text, /Preflight passed; nothing was changed/);
});

test("preflight fails before any change on a dirty checkout, wrong commit, stale ref, missing tool or variable", async () => {
  const cases = [
    [{ dirty: " M web/src/main.tsx\n" }, /uncommitted or untracked/],
    [{ ancestor: false }, /staging deploys only a commit on origin\/develop/],
    [{ tip: "" }, /origin\/develop is missing; run `git fetch origin`/],
    [{ tools: ["git", "flyctl", "bun", "node"] }, /supabase is not on PATH/],
    [{ env: { ...CONFIG, FLY_API_TOKEN_GAME: "" } }, /FLY_API_TOKEN_GAME is not set/],
    [
      { env: { ...CONFIG, WEB_VERSION_URL: "http://web.fake.test/version.json" } },
      /WEB_VERSION_URL must be an https URL/,
    ],
    [{ env: { ...CONFIG, GAME_SOCKET_ORIGIN: "ws://game.fake.test" } }, /GAME_SOCKET_ORIGIN must use wss:/],
  ];
  for (const [options, expected] of cases) {
    const h = harness(options);
    const { code, text } = await h.run("run", "staging", "all");
    assert.equal(code, 2, String(expected));
    assert.match(text, expected);
    assert.match(text, /nothing was changed/);
    assert.equal(h.mutating(), 0, String(expected));
  }
});

test("staging accepts a local origin/develop that lags GitHub's; production does not", async () => {
  const staging = harness({ remoteTip: OLD });
  const lagging = await staging.run("preflight", "staging", "all");
  assert.equal(lagging.code, 0);
  assert.ok(!staging.calls.some((c) => c.kind === "git" && c.args[0] === "ls-remote"));
  const production = await harness({ environment: "production", remoteTip: OLD }).run("preflight", "production");
  assert.equal(production.code, 2);
  assert.match(production.text, /origin\/production is stale/);
});

test("production deploys only the current origin/production tip", async () => {
  assert.equal((await harness({ environment: "production" }).run("preflight", "production")).code, 0);
  const older = await harness({ environment: "production", tip: DEVELOP_TIP }).run("preflight", "production");
  assert.equal(older.code, 2);
  assert.match(older.text, /only the current origin\/production tip/);
  const develop = await harness({ environment: "production", head: DEVELOP_TIP, tip: SHA }).run(
    "run",
    "production",
    "all",
  );
  assert.equal(develop.code, 2);
});

test("each scope requires only its own variables and tools", () => {
  assert.deepEqual(requirements("staging", "migrate"), {
    vars: ["STAGING_SUPABASE_DB_OWNER_URL"],
    tools: ["git", "supabase"],
  });
  assert.deepEqual(requirements("production", "migrate").vars, ["PROD_SUPABASE_DB_OWNER_URL"]);
  assert.deepEqual(requirements("staging", "api"), {
    vars: ["FLY_APP_API", "FLY_API_TOKEN_API", "API_VERSION_URL"],
    tools: ["git", "flyctl"],
  });
  assert.ok(!requirements("staging", "web").vars.some((name) => name.includes("FLY") || name.includes("SUPABASE_DB")));
  assert.ok(requirements("staging", "all").vars.includes("STAGING_SUPABASE_DB_OWNER_URL"));
  assert.ok(!requirements("staging", "all").vars.includes("PROD_SUPABASE_DB_OWNER_URL"));
  // Staging never falls back to the production owner URL.
  const env = { ...CONFIG, STAGING_SUPABASE_DB_OWNER_URL: "" };
  assert.deepEqual(
    checkConfig("staging", "migrate", env, () => true),
    ["STAGING_SUPABASE_DB_OWNER_URL is not set"],
  );
  // An api-only deploy doesn't need web or database configuration.
  const apiOnly = { FLY_APP_API: "a", FLY_API_TOKEN_API: "t", API_VERSION_URL: "https://x.test/version" };
  assert.deepEqual(
    checkConfig("staging", "api", apiOnly, () => true),
    [],
  );
});

// --- full deploy ------------------------------------------------------------------------------

test("a full deploy migrates first, then api, game and web, then verifies all three", async () => {
  const h = harness();
  const { code, text } = await h.run("run", "staging", "all");
  assert.equal(code, 0);
  assert.deepEqual(stepOrder(h), [
    "supabase:gen",
    "supabase:db",
    "fly:api",
    "fly:game",
    "bun:install",
    "bun:run",
    "node:web/scripts/vercel-deploy.mjs",
  ]);
  assert.deepEqual(
    h.calls.filter((c) => c.kind === "fetch").map((c) => c.url),
    [CONFIG.API_VERSION_URL, CONFIG.GAME_VERSION_URL, CONFIG.WEB_VERSION_URL],
  );
  assert.match(text, new RegExp(`Deployed ${SHA} to staging: migrations, api, game and web all verified`));
});

test("Fly deploys carry the exact flags, the SHA label and only their own token", async () => {
  const h = harness();
  await h.run("run", "staging", "all");
  const [api, game] = h.runs().filter((c) => c.command === "flyctl");
  assert.deepEqual(api.args, [
    "deploy",
    ".",
    "--config",
    "api/fly.toml",
    "--dockerfile",
    "api/Dockerfile",
    "--app",
    "schmegettes-api-staging",
    "--remote-only",
    "--build-arg",
    `GIT_SHA=${SHA}`,
    "--image-label",
    SHA,
    "--env",
    "APP_ENV=staging",
    "--wait-timeout",
    "10m",
  ]);
  assert.ok(game.args.includes("--ha=false"));
  assert.ok(!api.args.includes("--ha=false"));
  assert.ok(game.args.includes("game/fly.toml") && game.args.includes("schmegettes-game-staging"));
  assert.equal(api.env.FLY_API_TOKEN, SECRETS.FLY_API_TOKEN_API);
  assert.equal(game.env.FLY_API_TOKEN, SECRETS.FLY_API_TOKEN_GAME);
  for (const call of h.runs()) {
    // Tokens travel in the environment, never in arguments.
    for (const [name, value] of Object.entries(SECRETS)) {
      if (name.includes("SUPABASE_DB_OWNER_URL")) continue;
      assert.ok(!call.args.includes(value), `${name} in ${call.command} arguments`);
    }
    assert.equal(call.env.FLY_API_TOKEN_API, undefined);
    assert.equal(call.env.VERCEL_TOKEN === undefined || call.args[0] === "web/scripts/vercel-deploy.mjs", true);
  }
});

test("the web build gets the environment and SHA before the Vercel uploader runs", async () => {
  for (const environment of ["staging", "production"]) {
    const h = harness({ environment });
    await h.run("run", environment, "web");
    const [install, build, upload] = h.runs();
    assert.deepEqual(install.args, ["install", "--frozen-lockfile"]);
    assert.deepEqual(build.args, ["run", "--cwd", "web", "build"]);
    assert.equal(build.env.VITE_ENV, environment);
    assert.equal(build.env.GIT_SHA, SHA);
    assert.equal(build.env.VERCEL_TOKEN, undefined);
    assert.deepEqual(upload.args, ["web/scripts/vercel-deploy.mjs"]);
    assert.equal(upload.env.VERCEL_TOKEN, SECRETS.VERCEL_TOKEN);
    assert.equal(upload.env.GIT_SHA, SHA);
    assert.equal(upload.env.VITE_SUPABASE_URL, CONFIG.VITE_SUPABASE_URL);
  }
});

test("migrations use the pinned CLI with this environment's owner URL only", async () => {
  const h = harness({ environment: "production" });
  await h.run("run", "production", "migrate");
  const push = h.runs().find((c) => c.args[0] === "db");
  assert.deepEqual(push.args, ["db", "push", "--db-url", SECRETS.PROD_SUPABASE_DB_OWNER_URL, "--include-all"]);
  assert.equal(push.env.PROD_SUPABASE_DB_OWNER_URL, undefined);
  assert.equal(push.env.STAGING_SUPABASE_DB_OWNER_URL, undefined);
});

// --- failures and partial state ---------------------------------------------------------------

test("a migration failure starts no service deploy", async () => {
  const h = harness({ runCode: (c) => (c.command === "supabase" ? 1 : 0) });
  const { code, text } = await h.run("run", "staging", "all");
  assert.equal(code, 1);
  assert.ok(!h.runs().some((c) => c.command === "flyctl" || c.command === "bun" || c.command === "node"));
  assert.match(text, /✖ migrate: failed/);
  assert.match(text, /· api: not started/);
  assert.match(text, /No service was deployed/);
  assert.ok(!/Deployed .* to staging/.test(text));
});

test("a later failure reports exactly what deployed, what failed and the rollback reference", async () => {
  const cases = [
    ["api", [], ["game", "web", "verify"]],
    ["game", ["api"], ["web", "verify"]],
    ["web", ["api", "game"], ["verify"]],
  ];
  for (const [failing, done, notStarted] of cases) {
    const h = harness({
      runCode: (c) =>
        failing === "web"
          ? c.args[0] === "web/scripts/vercel-deploy.mjs"
            ? 1
            : 0
          : c.args[3]?.startsWith(failing)
            ? 1
            : 0,
    });
    const { code, text } = await h.run("run", "staging", "all");
    assert.equal(code, 1, failing);
    assert.match(text, /✔ migrate: done/);
    assert.match(text, new RegExp(`✖ ${failing}: failed`));
    for (const step of done) assert.match(text, new RegExp(`✔ ${step}: done`));
    for (const step of notStarted) assert.match(text, new RegExp(`· ${step}: not started`));
    if (done.length) assert.match(text, new RegExp(`${done.join(", ")} now run ${SHA}`));
    assert.ok(text.includes(ROLLBACK_REF));
    assert.match(text, /Do not treat staging as deployed/);
  }
});

test("a verification failure after every deploy is a failed deploy", async () => {
  const h = harness({ versions: (url) => (url === CONFIG.GAME_VERSION_URL ? OLD : SHA) });
  const { code, text } = await h.run("run", "staging", "all");
  assert.equal(code, 1);
  assert.match(text, new RegExp(`✖ game \\(game.fake.test\\): ${OLD}`));
  assert.match(text, /✖ verify: failed/);
  assert.match(text, /api, game, web now run/);
});

test("a crashing step is reported as a failure, not an unhandled error", async () => {
  const h = harness({
    runCode: (c) => {
      if (c.command === "flyctl") throw new Error("spawn flyctl ENOENT");
      return 0;
    },
  });
  const { code, text } = await h.run("run", "staging", "api");
  assert.equal(code, 1);
  assert.match(text, /api: spawn flyctl ENOENT/);
});

// --- component deploys ------------------------------------------------------------------------

test("a component deploy touches and verifies only that component and says the rest may differ", async () => {
  const h = harness({ versions: (url) => (url === CONFIG.API_VERSION_URL ? SHA : OLD) });
  const { code, text } = await h.run("run", "staging", "api");
  assert.equal(code, 0);
  assert.deepEqual(stepOrder(h), ["fly:api"]);
  assert.deepEqual(
    h.calls.filter((c) => c.kind === "fetch").map((c) => c.url),
    [CONFIG.API_VERSION_URL],
  );
  assert.match(text, /Only api changed: the other components may run other commits/);
  assert.match(text, /mise run deploy -- verify staging all/);
  assert.ok(!/Deployed .* to staging: migrations/.test(text));
});

test("a component deploy never runs migrations", async () => {
  for (const component of ["api", "game", "web"]) {
    const h = harness();
    await h.run("run", "staging", component);
    assert.ok(!h.runs().some((c) => c.command === "supabase"), component);
  }
});

// --- signing key ------------------------------------------------------------------------------

test("a throwaway signing key is created for migrations and removed afterwards", async () => {
  const h = harness();
  await h.run("run", "staging", "migrate");
  const key = join(ROOT, "supabase/signing_keys.json");
  assert.deepEqual(h.fsLog, [`write ${key}`, `remove ${key}`]);
  const gen = h.runs().find((c) => c.args[0] === "gen");
  assert.deepEqual(gen.args, ["gen", "signing-key", "--algorithm", "ES256", "--yes"]);
});

test("an existing developer signing key is left alone, and a failed migration still cleans up", async () => {
  const key = join(ROOT, "supabase/signing_keys.json");
  const kept = harness({ files: [key] });
  await kept.run("run", "staging", "migrate");
  assert.deepEqual(kept.fsLog, []);
  assert.ok(kept.fsFiles.has(key));
  assert.ok(!kept.runs().some((c) => c.args[0] === "gen"));

  const failed = harness({ runCode: () => 1 });
  await failed.run("run", "staging", "migrate");
  assert.deepEqual(failed.fsLog, [`write ${key}`, `remove ${key}`]);
});

// --- verification -----------------------------------------------------------------------------

test("verifyVersions retries until every URL matches", async () => {
  let calls = 0;
  let clock = 0;
  const result = await verifyVersions({ api: "https://a.test/version" }, SHA, {
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ commit: calls < 3 ? OLD : SHA }) };
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
});

test("verifyVersions gives up after the timeout and reports HTTP errors, bad JSON, outages and wrong SHAs", async () => {
  const urls = { api: "https://a.test", game: "https://g.test", web: "https://w.test" };
  const answers = { "https://a.test": 503, "https://g.test": "garbage", "https://w.test": new Error("ECONNREFUSED") };
  let clock = 0;
  const result = await verifyVersions(urls, SHA, {
    fetchImpl: async (url) => {
      const value = answers[url];
      if (value instanceof Error) throw value;
      if (typeof value === "number") return { ok: false, status: value };
      return { ok: true, status: 200, json: async () => JSON.parse("{") };
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.last, { api: "HTTP 503", game: "invalid response", web: "unreachable" });
  assert.ok(clock <= VERIFY_TIMEOUT_MS && clock >= VERIFY_TIMEOUT_MS - 20_000);
});

test("verify checks a given SHA without needing a clean checkout or provider credentials", async () => {
  const env = { API_VERSION_URL: CONFIG.API_VERSION_URL };
  const h = harness({ env, dirty: " M x\n", versions: () => OLD });
  const { code, text } = await h.run("verify", "staging", "api", "--sha", OLD);
  assert.equal(code, 0);
  assert.match(text, new RegExp(`✔ api \\(api.fake.test\\): ${OLD}`));
  assert.equal(h.mutating(), 0);
  const missing = await harness({ env }).run("verify", "staging", "all");
  assert.equal(missing.code, 2);
  assert.match(missing.text, /WEB_VERSION_URL is not set/);
});

// --- secrets ----------------------------------------------------------------------------------

test("secrets are redacted from text and removed from child environments", () => {
  const redact = redactor(SECRETS);
  assert.equal(redact(`token ${SECRETS.VERCEL_TOKEN} url ${SECRETS.PROD_SUPABASE_DB_OWNER_URL}`), "token *** url ***");
  const child = childEnv({ ...SECRETS, PATH: "/bin" }, { FLY_API_TOKEN: "x" });
  assert.deepEqual(child, { PATH: "/bin", FLY_API_TOKEN: "x" });
});

test("plan lists the steps for each scope", () => {
  assert.deepEqual(plan("all"), ["migrate", "api", "game", "web", "verify"]);
  assert.deepEqual(plan("migrate"), ["migrate"]);
  assert.deepEqual(plan("web"), ["web", "verify"]);
});

// --- workflows --------------------------------------------------------------------------------

const workflow = (name) =>
  readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), ".github", "workflows", name), "utf8");
const onBlock = (text) => text.match(/^on:\n([\s\S]*?)^\S/m)[1];

test("deploy.yml calls the shared command and keeps no deploy logic of its own", () => {
  const text = workflow("deploy.yml");
  assert.match(text, /node scripts\/deploy\.mjs run "\$ENVIRONMENT" all/);
  for (const forbidden of [
    "flyctl deploy",
    "fly deploy",
    "supabase db push",
    "vercel-deploy",
    "/version",
    "VERSION_URLS",
    "curl",
  ]) {
    assert.ok(!text.includes(forbidden), `deploy.yml still contains ${forbidden}`);
  }
  assert.match(text, /environment: \$\{\{ inputs\.environment \}\}/);
  assert.match(text, /fetch-depth: 0/);
});

test("deploy and CI triggers are unchanged", () => {
  assert.equal(
    onBlock(workflow("deploy-staging.yml")),
    '  push:\n    branches:\n      - develop\n    # Docs-only merges change nothing deployed. Same rule as ci.yml\'s docs_only: a push is\n    # skipped only when every changed file matches. Keep the two lists in step.\n    paths-ignore:\n      - "docs/**"\n      - "tasks/**"\n      - "releases/**"\n      - "**.md"\n  # Manual re-run, e.g. after setting a missing secret. Start it on the develop branch.\n  workflow_dispatch:\n\n',
  );
  assert.match(
    onBlock(workflow("deploy-prod.yml")),
    /^ {2}push:\n {4}branches:\n {6}- production\n[\s\S]*^ {2}workflow_dispatch:\n/m,
  );
  const ci = onBlock(workflow("ci.yml"));
  assert.match(ci, /^ {2}pull_request:/m);
  assert.match(ci, /^ {2}schedule:\n {4}- cron: "0 9 \* \* 1"/m);
  assert.match(ci, /^ {2}workflow_dispatch:/m);
  for (const name of ["deploy-staging.yml", "deploy-prod.yml"]) {
    assert.match(workflow(name), /concurrency:\n {2}group: deploy-\w+\n {2}cancel-in-progress: false/);
  }
});

// --- telemetry (GH-241) ------------------------------------------------------------------------

const withTelemetry = { ...CONFIG, ...SECRETS, ...TELEMETRY };
const annotations = (h) => h.calls.filter((c) => c.kind === "fetch" && c.url.endsWith("/api/annotations"));

test("telemetry secrets are staged on each Fly app before its deploy, on stdin and never in arguments", async () => {
  const h = harness({ env: withTelemetry });
  const { code } = await h.run("run", "staging", "all");
  assert.equal(code, 0);
  const fly = h.runs().filter((c) => c.command === "flyctl");
  assert.deepEqual(
    fly.map((c) => `${c.args[0]} ${c.args.at(-1) === "10m" ? c.args[3] : c.args.at(-1)}`),
    [
      "secrets schmegettes-api-staging",
      "deploy api/fly.toml",
      "secrets schmegettes-game-staging",
      "deploy game/fly.toml",
    ],
  );
  const [apiSecrets, , gameSecrets] = fly;
  assert.deepEqual(apiSecrets.args, ["secrets", "import", "--stage", "--app", "schmegettes-api-staging"]);
  assert.equal(apiSecrets.env.FLY_API_TOKEN, SECRETS.FLY_API_TOKEN_API);
  assert.equal(gameSecrets.env.FLY_API_TOKEN, SECRETS.FLY_API_TOKEN_GAME);
  for (const c of [apiSecrets, gameSecrets]) {
    assert.equal(
      c.input,
      `OTEL_EXPORTER_OTLP_ENDPOINT=${TELEMETRY.OTEL_EXPORTER_OTLP_ENDPOINT}\nOTEL_EXPORTER_OTLP_HEADERS=${SECRETS.OTEL_EXPORTER_OTLP_HEADERS}\n`,
    );
  }
  for (const call of h.runs()) {
    for (const name of ["OTEL_EXPORTER_OTLP_HEADERS", "GRAFANA_ANNOTATION_TOKEN"]) {
      assert.ok(!call.args.some((a) => a.includes(SECRETS[name])), `${name} in ${call.command} arguments`);
      assert.equal(call.env[name], undefined, `${name} in ${call.command}'s environment`);
    }
  }
});

test("a failed secret import stops that component's deploy", async () => {
  const h = harness({ env: withTelemetry, runCode: (c) => (c.args[0] === "secrets" ? 1 : 0) });
  const { code, text } = await h.run("run", "staging", "api");
  assert.equal(code, 1);
  assert.ok(!h.runs().some((c) => c.args[0] === "deploy"));
  assert.match(text, /✖ api failed/);
});

test("the web build and the CSP get VITE_FARO_URL when it is set", async () => {
  const h = harness({ env: withTelemetry });
  await h.run("run", "staging", "web");
  const [, build, upload] = h.runs();
  assert.equal(build.env.VITE_FARO_URL, TELEMETRY.VITE_FARO_URL);
  assert.equal(upload.env.VITE_FARO_URL, TELEMETRY.VITE_FARO_URL);
});

test("a deploy writes a Grafana annotation with the commit, environment and scope", async () => {
  const h = harness({ env: withTelemetry });
  const { code, text } = await h.run("run", "staging", "all");
  assert.equal(code, 0);
  const [call] = annotations(h);
  assert.equal(call.url, "https://stack.fake.test/api/annotations");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers.Authorization, `Bearer ${SECRETS.GRAFANA_ANNOTATION_TOKEN}`);
  assert.deepEqual(JSON.parse(call.options.body), {
    tags: ["deploy", "staging", "all"],
    text: "aaaaaaa Add the scoreboard (#42)",
  });
  assert.match(text, /deploy annotation written/);
  // After verification: the version checks come first.
  const fetches = h.calls.filter((c) => c.kind === "fetch").map((c) => c.url);
  assert.equal(fetches.at(-1), call.url);
});

test("a failed deploy is annotated with failed and the step", async () => {
  const h = harness({ env: withTelemetry, runCode: (c) => (c.args[3] === "game/fly.toml" ? 1 : 0) });
  const { code } = await h.run("run", "staging", "all");
  assert.equal(code, 1);
  const body = JSON.parse(annotations(h)[0].options.body);
  assert.deepEqual(body.tags, ["deploy", "staging", "all", "failed", "failed:game"]);
  assert.match(body.text, /\(failed at game\)$/);
});

test("an annotation failure is a warning, never a failed deploy", async () => {
  for (const annotation of [() => 500, () => new Error("network down")]) {
    const h = harness({ env: withTelemetry, annotation });
    const { code, text } = await h.run("run", "staging", "web");
    assert.equal(code, 0);
    assert.match(text, /⚠ deploy annotation not written/);
  }
});

test("without telemetry configuration every telemetry step is skipped, and says so", async () => {
  const h = harness();
  const { code, text } = await h.run("run", "staging", "all");
  assert.equal(code, 0);
  assert.ok(!h.runs().some((c) => c.args[0] === "secrets"));
  assert.equal(annotations(h).length, 0);
  assert.match(text, /otel {5}not configured; skipped/);
  assert.match(text, /faro {5}not configured; off/);
  assert.match(text, /annotate not configured; skipped/);
});

test("preflight rejects half-set or non-https telemetry settings", async () => {
  for (const [extra, problem] of [
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: TELEMETRY.OTEL_EXPORTER_OTLP_ENDPOINT }, /set both OTEL_EXPORTER_OTLP_ENDPOINT/],
    [
      {
        ...TELEMETRY,
        OTEL_EXPORTER_OTLP_HEADERS: "x".repeat(10),
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otlp.fake.test",
      },
      /OTEL_EXPORTER_OTLP_ENDPOINT must be an https URL/,
    ],
    [{ VITE_FARO_URL: "http://faro.fake.test/collect" }, /VITE_FARO_URL must be an https URL/],
    [{ GRAFANA_URL: "http://stack.fake.test" }, /GRAFANA_URL must be an https URL/],
  ]) {
    const h = harness({ env: { ...CONFIG, ...extra } });
    const { code, text } = await h.run("preflight", "staging", "all");
    assert.equal(code, 2);
    assert.match(text, problem);
    assert.equal(h.mutating(), 0);
  }
});

test("deploy.yml maps the optional telemetry values onto the command", () => {
  const text = workflow("deploy.yml");
  for (const line of [
    "OTEL_EXPORTER_OTLP_ENDPOINT: ${{ vars.OTEL_EXPORTER_OTLP_ENDPOINT }}",
    "OTEL_EXPORTER_OTLP_HEADERS: ${{ secrets.OTEL_EXPORTER_OTLP_HEADERS }}",
    "VITE_FARO_URL: ${{ vars.VITE_FARO_URL }}",
    "GRAFANA_URL: ${{ vars.GRAFANA_URL }}",
    "GRAFANA_ANNOTATION_TOKEN: ${{ secrets.GRAFANA_ANNOTATION_TOKEN }}",
  ]) {
    assert.ok(text.includes(line), `deploy.yml is missing ${line}`);
  }
});
