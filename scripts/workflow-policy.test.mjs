// Run with: node --test scripts/workflow-policy.test.mjs
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: fixtures contain literal GitHub Actions ${{ }} expressions
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDirectory, checkWorkflow, formatViolation, TRUSTED_PR_GUARD } from "./workflow-policy.mjs";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const rulesOf = (text) => checkWorkflow("fixture.yml", text).map((v) => v.rule);

const clean = `name: Clean
on:
  pull_request:
    branches: [develop]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA} # v7.0.1
      - uses: ./.github/actions/local
      - name: Uses a safe expression
        run: echo "\${{ github.event.pull_request.head.sha }}"
`;

test("the repository's workflows pass every rule", () => {
  const dir = join(fileURLToPath(new URL("..", import.meta.url)), ".github", "workflows");
  const violations = checkDirectory(dir);
  assert.deepEqual(violations.map(formatViolation), []);
});

test("a clean workflow passes", () => {
  assert.deepEqual(rulesOf(clean), []);
});

test("no-untrusted-trigger: pull_request_target and workflow_run fail, in block or flow form", () => {
  assert.deepEqual(rulesOf(clean.replace("  pull_request:\n", "  pull_request_target:\n")), ["no-untrusted-trigger"]);
  assert.deepEqual(rulesOf(clean.replace("  workflow_dispatch:\n", "  workflow_run:\n")), ["no-untrusted-trigger"]);
  const flow = clean.replace(
    /on:\n {2}pull_request:\n {4}branches: \[develop\]\n {2}workflow_dispatch:\n/,
    "on: [push, workflow_run]\n",
  );
  assert.deepEqual(rulesOf(flow), ["no-untrusted-trigger"]);
});

test("permissions: a workflow without top-level or job permissions fails", () => {
  assert.deepEqual(rulesOf(clean.replace("permissions:\n  contents: read\n", "")), ["permissions"]);
  const jobLevel = clean
    .replace("permissions:\n  contents: read\n", "")
    .replace("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n");
  assert.deepEqual(rulesOf(jobLevel), []);
});

test("pinned-action: tags, branches and short SHAs fail; full SHAs and local actions pass", () => {
  assert.deepEqual(rulesOf(clean.replace(`@${SHA} # v7.0.1`, "@v7")), ["pinned-action"]);
  assert.deepEqual(rulesOf(clean.replace(`@${SHA} # v7.0.1`, "@main")), ["pinned-action"]);
  assert.deepEqual(rulesOf(clean.replace(`@${SHA} # v7.0.1`, "@3d3c42e")), ["pinned-action"]);
  assert.deepEqual(rulesOf(clean.replace(`actions/checkout@${SHA} # v7.0.1`, "docker://alpine:3")), ["pinned-action"]);
});

test("run-injection: untrusted expressions in a script fail, inline or block", () => {
  for (const expression of [
    "github.event.pull_request.title",
    "github.event.pull_request.body",
    "github.event.pull_request.head.ref",
    "github.head_ref",
    "github.event.comment.body",
    "inputs.files",
  ]) {
    const inline = clean.replace("github.event.pull_request.head.sha", expression);
    assert.deepEqual(rulesOf(inline), ["run-injection"], expression);
  }
  const block = clean.replace(
    '        run: echo "${{ github.event.pull_request.head.sha }}"\n',
    '        run: |\n          set -e\n          echo "${{ github.head_ref }}"\n',
  );
  assert.deepEqual(rulesOf(block), ["run-injection"]);
  const viaEnv = clean.replace(
    '        run: echo "${{ github.event.pull_request.head.sha }}"\n',
    '        env:\n          TITLE: ${{ github.event.pull_request.title }}\n        run: echo "$TITLE"\n',
  );
  assert.deepEqual(rulesOf(viaEnv), []);
});

test("fork-guard: a PR-triggered job with write permissions or secrets needs the trusted-PR guard", () => {
  const writes = clean.replace(
    "    runs-on: ubuntu-latest\n",
    "    runs-on: ubuntu-latest\n    permissions:\n      issues: write\n",
  );
  assert.deepEqual(rulesOf(writes), ["fork-guard"]);
  const secrets = clean.replace(
    "      - uses: ./.github/actions/local\n",
    "      - uses: ./.github/actions/local\n        env:\n          KEY: ${{ secrets.API_KEY }}\n",
  );
  assert.deepEqual(rulesOf(secrets), ["fork-guard"]);
  const inherit = clean.replace(
    / {4}runs-on: ubuntu-latest\n {4}steps:[\s\S]*$/,
    "    uses: ./.github/workflows/deploy.yml\n    secrets: inherit\n",
  );
  assert.deepEqual(rulesOf(inherit), ["fork-guard"]);
  const guarded = writes.replace(
    "    runs-on: ubuntu-latest\n",
    `    if: github.event_name != 'pull_request' || ${TRUSTED_PR_GUARD}\n    runs-on: ubuntu-latest\n`,
  );
  assert.deepEqual(rulesOf(guarded), []);
  const githubToken = clean.replace(
    "      - uses: ./.github/actions/local\n",
    "      - uses: ./.github/actions/local\n        with:\n          token: ${{ secrets.GITHUB_TOKEN }}\n",
  );
  assert.deepEqual(rulesOf(githubToken), []);
  const notPr = writes.replace("  pull_request:\n    branches: [develop]\n", "  push:\n    branches: [production]\n");
  assert.deepEqual(rulesOf(notPr), []);
});

test("hosted-runner: a self-hosted runner fails", () => {
  assert.deepEqual(rulesOf(clean.replace("runs-on: ubuntu-latest", "runs-on: [self-hosted, linux]")), [
    "hosted-runner",
  ]);
});

test("a violation names the file, job and rule", () => {
  const [violation] = checkWorkflow("x.yml", clean.replace("runs-on: ubuntu-latest", "runs-on: self-hosted"));
  assert.equal(formatViolation(violation), "x.yml (job test): [hosted-runner] uses a self-hosted runner");
});
