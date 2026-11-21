import assert from "node:assert/strict";
import { test } from "node:test";

import { accountManifest, cleanupRequest, loadConfig, parseArgs, parseDotenv, UsageError } from "./qa-accounts.mjs";

test("create and list parse for every environment", () => {
  assert.deepEqual(parseArgs(["--env", "local", "create"]), { env: "local", command: "create" });
  assert.deepEqual(parseArgs(["list", "--env=staging"]), { env: "staging", command: "list" });
  assert.throws(() => parseArgs(["--env", "prod", "create"]), UsageError);
  assert.throws(() => parseArgs(["--env", "local", "create", "--apply"]), UsageError);
});

test("cleanup is a dry run by default, including production", () => {
  assert.deepEqual(parseArgs(["--env", "local", "cleanup"]), {
    env: "local",
    command: "cleanup",
    olderThanHours: 0,
    dryRun: true,
  });
  assert.deepEqual(parseArgs(["--env", "production", "cleanup"]), {
    env: "production",
    command: "cleanup",
    olderThanHours: 24,
    dryRun: true,
  });
});

test("production apply requires an explicit yes", () => {
  assert.throws(() => parseArgs(["--env", "production", "cleanup", "--apply"]), UsageError);
  assert.deepEqual(parseArgs(["--env", "production", "cleanup", "--apply", "--yes"]), {
    env: "production",
    command: "cleanup",
    olderThanHours: 24,
    dryRun: false,
  });
  assert.throws(() => parseArgs(["--env", "production", "cleanup", "--yes"]), UsageError);
});

test("cleanup age is bounded and becomes the api request", () => {
  const req = parseArgs(["cleanup", "--env", "staging", "--older-than-hours=12", "--apply"]);
  assert.deepEqual(cleanupRequest(req), {
    method: "POST",
    path: "/v1/admin/qa-cleanup",
    body: { olderThanHours: 12, dryRun: false },
  });
  for (const value of ["-1", "1.5", "8761", "later"]) {
    assert.throws(() => parseArgs(["cleanup", "--env", "staging", "--older-than-hours", value]), UsageError);
  }
});

test("manifest is exactly one host and six contestants", () => {
  const accounts = accountManifest("qa.example.com");
  assert.equal(accounts.length, 7);
  assert.deepEqual(accounts[0], { email: "qa-host@qa.example.com", role: "host", label: "QA Host" });
  assert.equal(accounts.filter((account) => account.role === "contestant").length, 6);
  assert.equal(new Set(accounts.map((account) => account.email)).size, 7);
});

test("config comes from the environment first, then devtools dotenv", () => {
  const file = [
    "VITE_STAGING_SUPABASE_URL=https://supabase.file",
    "VITE_STAGING_SUPABASE_ANON_KEY=anon",
    "VITE_STAGING_API_URL=https://api.file",
    "VITE_STAGING_QA_ACCOUNT_DOMAIN=qa.example.com",
  ].join("\n");
  assert.deepEqual(loadConfig("staging", { VITE_STAGING_API_URL: "https://api.env" }, file), {
    supabaseUrl: "https://supabase.file",
    anonKey: "anon",
    apiUrl: "https://api.env",
    domain: "qa.example.com",
  });
  assert.throws(() => loadConfig("production", {}, file), UsageError);
  assert.deepEqual(parseDotenv("A=1\nB = 'two'\n"), { A: "1", B: "two" });
});
