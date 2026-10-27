"use strict";
// Run with: node --test scripts/daily-merge-guard.test.cjs
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");
const { evaluateCommit, failureMessage } = require("./daily-merge-guard.cjs");

const root = path.resolve(__dirname, "..");
const script = path.join(__dirname, "daily-merge-guard.cjs");

test("a [Daily] commit with one parent is a squashed daily merge and names its pull request", () => {
  assert.deepEqual(evaluateCommit({ subject: "[Daily] 2026-10-09 (#1617)", parents: ["a"] }), {
    squashed: true,
    pullRequest: "1617",
  });
  assert.deepEqual(evaluateCommit({ subject: "[Daily] 2026-10-09", parents: ["a"] }), {
    squashed: true,
    pullRequest: null,
  });
});

test("merge commits, task commits and Dependabot squashes pass", () => {
  const passing = [
    { subject: "Merge pull request #1672 from Everlo-Software/daily/2026-10-12", parents: ["a", "b"] },
    { subject: "[Daily] 2026-10-12", parents: ["a", "b"] },
    { subject: "build(deps): bump diff from 7.0.0 to 9.0.0 (#1626)", parents: ["a"] },
    { subject: "[Bug Fix] KAN-403: webhook-replay-idempotency (#1589)", parents: ["a"] },
    { subject: "docs: note on [Daily] branches (#1)", parents: ["a"] },
  ];
  for (const commit of passing) assert.equal(evaluateCommit(commit).squashed, false, commit.subject);
});

test("the failure message names the pull request and points at the repair steps", () => {
  const message = failureMessage(
    { sha: "10bac03d2cfa99bdfc71c8f74ca328dd4a0dc4a4", subject: "[Daily] 2026-10-09 (#1617)" },
    "1617",
    { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "wygarner/schmegettes" },
  );
  assert.match(message, /pull request #1617 \(https:\/\/github\.com\/wygarner\/schmegettes\/pull\/1617\)/);
  assert.match(message, /branch-strategy\.md, "When a daily PR was squashed"/);
  assert.match(message, /Do not delete the daily branch yet/);
});

// The real commits on develop. Skipped in a clone that does not have them (a shallow CI checkout).
const realCommits = [
  ["10bac03d2cfa99bdfc71c8f74ca328dd4a0dc4a4", 1, "daily PR #1617, squash-merged"],
  ["6c3cf0b08c2d6fccfc82b249f943a6a9814a9747", 1, "daily PR #1656, squash-merged"],
  ["6f239c9353e6550f82aac3a5f6194a5285f5b6fa", 0, "daily PR #1672, merge commit"],
  ["eddcfb58ba71f85abe6606bfaabde25e12a44996", 0, "Dependabot PR #1626, squash-merged"],
];

const hasCommit = (sha) => {
  try {
    const parents = execFileSync("git", ["show", "-s", "--format=%P", `${sha}^{commit}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    // A commit at the edge of a shallow clone reports no parents, which would hide a squash.
    return parents.trim() !== "";
  } catch {
    return false;
  }
};

for (const [sha, expectedStatus, description] of realCommits) {
  test(`${description} (${sha.slice(0, 8)}) exits ${expectedStatus}`, {
    skip: !hasCommit(sha) && "commit not in this clone",
  }, () => {
    const result = spawnSync("node", [script, sha], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_ACTIONS: "" },
    });
    assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
    if (expectedStatus === 1) assert.match(result.stderr, /Daily PR was squash-merged: pull request #\d+/);
  });
}
