import assert from "node:assert/strict";
import { test } from "node:test";

import { apiRequest, loadConfig, MAX_MINUTES, parseArgs, parseDotenv, UsageError } from "./staff-access.mjs";

const ID = "22222222-2222-4222-8222-222222222222";

test("grant with defaults", () => {
  assert.deepEqual(parseArgs(["--env", "staging", "grant", "user", ID, "--reason", "  Bob's missing game  "]), {
    env: "staging",
    command: "grant",
    subjectType: "user",
    subjectId: ID,
    reason: "Bob's missing game",
    minutes: 60,
  });
});

test("grant accepts --flag=value and a duration up to the maximum", () => {
  const req = parseArgs(["grant", "room", ID, "--reason=lobby stuck", `--minutes=${MAX_MINUTES}`, "--env=production"]);
  assert.equal(req.minutes, 480);
  assert.equal(req.subjectType, "room");
  assert.equal(req.env, "production");
});

test("grant refuses more than 8 hours, zero, and fractions", () => {
  for (const minutes of ["481", "0", "-5", "1.5", "lots"]) {
    assert.throws(
      () => parseArgs(["--env", "staging", "grant", "game", ID, "--reason", "x", "--minutes", minutes]),
      UsageError,
      minutes,
    );
  }
});

test("grant needs a subject type, a UUID, and a reason of at most 200 characters", () => {
  const base = ["--env", "staging", "grant"];
  assert.throws(() => parseArgs([...base, "profile", ID, "--reason", "x"]), UsageError);
  assert.throws(() => parseArgs([...base, "user", "bob", "--reason", "x"]), UsageError);
  assert.throws(() => parseArgs([...base, "user", ID]), UsageError);
  assert.throws(() => parseArgs([...base, "user", ID, "--reason", "   "]), UsageError);
  assert.throws(() => parseArgs([...base, "user", ID, "--reason", "x".repeat(201)]), UsageError);
  assert.doesNotThrow(() => parseArgs([...base, "user", ID, "--reason", "é".repeat(200)]));
});

test("--env is required and limited", () => {
  assert.throws(() => parseArgs(["read", ID]), UsageError);
  assert.throws(() => parseArgs(["--env", "prod", "read", ID]), UsageError);
  assert.throws(() => parseArgs(["--env"]), UsageError);
});

test("read and revoke take one grant id; flags must belong to the command", () => {
  assert.deepEqual(parseArgs(["--env", "local", "read", ID]), { env: "local", command: "read", grantId: ID });
  assert.deepEqual(parseArgs(["--env", "local", "revoke", ID]), { env: "local", command: "revoke", grantId: ID });
  assert.throws(() => parseArgs(["--env", "local", "read"]), UsageError);
  assert.throws(() => parseArgs(["--env", "local", "read", ID, ID]), UsageError);
  assert.throws(() => parseArgs(["--env", "local", "read", ID, "--minutes", "5"]), UsageError);
  assert.throws(() => parseArgs(["--env", "local", "delete", ID]), UsageError);
});

test("audit filters", () => {
  const req = parseArgs(["--env", "staging", "audit", "--action", "staff_read", "--subject", ID]);
  assert.deepEqual(apiRequest(req), { method: "GET", path: `/v1/admin/audit?action=staff_read&subject=${ID}` });
  assert.equal(apiRequest(parseArgs(["--env", "staging", "audit"])).path, "/v1/admin/audit");
  assert.throws(() => parseArgs(["--env", "staging", "audit", "--since", "yesterday"]), UsageError);
});

test("api requests", () => {
  assert.deepEqual(
    apiRequest(parseArgs(["--env", "staging", "grant", "user", ID, "--reason", "r", "--minutes", "5"])),
    {
      method: "POST",
      path: "/v1/admin/staff-access",
      body: { subjectType: "user", subjectId: ID, reason: "r", minutes: 5 },
    },
  );
  assert.deepEqual(apiRequest(parseArgs(["--env", "staging", "revoke", ID])), {
    method: "DELETE",
    path: `/v1/admin/staff-access/${ID}`,
  });
});

test("config comes from the environment first, then devtools/.env.local", () => {
  const file =
    'VITE_STAGING_SUPABASE_URL="https://s.example"\nVITE_STAGING_SUPABASE_ANON_KEY=anon\nVITE_STAGING_API_URL=https://api.file\n';
  assert.deepEqual(loadConfig("staging", { VITE_STAGING_API_URL: "https://api.env" }, file), {
    supabaseUrl: "https://s.example",
    anonKey: "anon",
    apiUrl: "https://api.env",
  });
  assert.throws(() => loadConfig("production", {}, file), UsageError);
  assert.deepEqual(parseDotenv("# comment\nA=1\n\nB = 'two'\n"), { A: "1", B: "two" });
});
