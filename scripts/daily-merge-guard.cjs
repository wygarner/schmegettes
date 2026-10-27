"use strict";
// Fails when a commit is a squash-merged daily PR: its subject starts with "[Daily]" and it has
// one parent. The daily/YYYY-MM-DD -> develop PR must merge as a merge commit, whose subject is
// "Merge pull request #N from ..." and which has two parents. See docs/system-docs/engineering/branch-strategy.md,
// "When a daily PR was squashed".
//
// Usage: node scripts/daily-merge-guard.cjs [commit]   (default: HEAD)
// Called by .github/workflows/daily-merge-guard.yml. Test: node --test scripts/daily-merge-guard.test.cjs
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const REPAIR_DOC = "docs/system-docs/engineering/branch-strategy.md";
const REPAIR_SECTION = "When a daily PR was squashed";

// A squash or rebase merge leaves one parent; a merge commit has two.
function evaluateCommit({ subject, parents }) {
  const isDaily = subject.startsWith("[Daily]");
  const squashed = isDaily && parents.length === 1;
  const pullRequest = squashed ? ((subject.match(/\(#(\d+)\)\s*$/) || [])[1] ?? null) : null;
  return { squashed, pullRequest };
}

function readCommit(ref, cwd = process.cwd()) {
  const out = execFileSync("git", ["show", "-s", "--format=%H%n%P%n%s", `${ref}^{commit}`], {
    cwd,
    encoding: "utf8",
  });
  const [sha, parents, subject] = out.split("\n");
  return { sha, parents: parents.split(" ").filter(Boolean), subject };
}

function failureMessage(commit, pullRequest, env = process.env) {
  const repoUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}` : null;
  const pr = pullRequest
    ? `pull request #${pullRequest}${repoUrl ? ` (${repoUrl}/pull/${pullRequest})` : ""}`
    : "a daily pull request (no pull request number in the commit subject)";
  const doc = repoUrl ? `${repoUrl}/blob/develop/${REPAIR_DOC}` : REPAIR_DOC;
  return [
    `Daily PR was squash-merged: ${pr} landed on develop as one commit, ${commit.sha.slice(0, 8)} "${commit.subject}".`,
    "",
    "The daily PR must merge as a merge commit so each task stays one commit on develop.",
    "",
    "What to do now:",
    "1. Do not delete the daily branch yet. It is the only place the per-task commits still exist.",
    "2. If nothing else has landed on develop since this commit, the squash can be reverted and the daily",
    "   branch merged again as a merge commit (gh pr merge --merge).",
    "3. Otherwise leave it. scripts/release-scope.cjs reads the tickets out of this commit and its pull",
    "   request, so the release scope is still complete.",
    "",
    `Full steps: ${doc}, "${REPAIR_SECTION}".`,
  ].join("\n");
}

function main(argv, env = process.env) {
  const commit = readCommit(argv[0] || "HEAD");
  const { squashed, pullRequest } = evaluateCommit(commit);
  const label = `${commit.sha.slice(0, 8)} "${commit.subject}" (${commit.parents.length} parent${commit.parents.length === 1 ? "" : "s"})`;
  if (!squashed) {
    console.log(`OK: ${label} is not a squashed daily merge.`);
    return 0;
  }
  const message = failureMessage(commit, pullRequest, env);
  if (env.GITHUB_ACTIONS === "true") {
    // The annotation shows on the run page and the commit; the summary carries the full steps.
    console.log(
      `::error title=Daily PR was squash-merged::${message.split("\n")[0]} See the job summary for the repair steps.`,
    );
    if (env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### Daily PR was squash-merged\n\n${message}\n`);
  }
  console.error(message);
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { evaluateCommit, readCommit, failureMessage, main };
