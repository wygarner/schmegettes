"use strict";
// Lists the Jira tickets between two refs. Task PRs squash into develop, one commit each.
// Before 2026-11-18 tasks went through daily branches, and three of those were squashed too.
//
// Ticket keys come from commit subjects. A daily PR that was squash-merged hides the day's tasks
// in one "[Daily] YYYY-MM-DD (#N)" commit, so for those commits the keys are also read from the
// task lines in the commit body and from the merged pull request's description (through gh).
//
// Usage: node scripts/release-scope.cjs [base] [head]     default: origin/production origin/develop
//        node scripts/release-scope.cjs base..head
//        --no-gh   do not call gh; squashed dailies are read from the commit body only
// Test:  node --test scripts/release-scope.test.cjs
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// The Jira project key comes from .github/jira.json (JIRA_PROJECT_KEY overrides it, for tests).
const PROJECT_KEY =
  process.env.JIRA_PROJECT_KEY ||
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".github", "jira.json"), "utf8")).projectKey;

const KEY = new RegExp(`\\b${PROJECT_KEY}-\\d+\\b`, "g");
const TASK_TYPES = ["New Feature", "Enhancement", "Improvement", "Bug Fix"];
// PR titles have not always used the four names above.
const TYPE_ALIASES = {
  "technical improvement": "Improvement",
  feature: "New Feature",
  bugfix: "Bug Fix",
  fix: "Bug Fix",
};
const PREFIX_TYPES = { feat: "New Feature", enhance: "Enhancement", improve: "Improvement", fix: "Bug Fix" };
const BRANCH_TYPES = {
  "new-feature": "New Feature",
  enhancement: "Enhancement",
  "technical-improvement": "Improvement",
  "bug-fix": "Bug Fix",
};
const BULLET = /^\s*[*-]\s+/;
const CONVENTIONAL = /^([a-z]+)(\([^)]*\))?!?:\s*/;

const keysIn = (text) => [...new Set(text.match(KEY) || [])];
const isDaily = (subject) => subject.startsWith("[Daily]");
const isListLine = (line) => BULLET.test(line);
const taskType = (bracket) => {
  if (!bracket) return null;
  const name = bracket.trim().toLowerCase();
  return TASK_TYPES.find((type) => type.toLowerCase() === name) || TYPE_ALIASES[name] || null;
};

// What one line says about the tickets it names.
//   impl   - an implementation, with its task type
//   done   - "delete task folder for KAN-N", the last commit of every implementation
//   branch - a merge commit from a task branch: gives the type, does not prove an implementation
//   spec   - a task spec, product brief or docs change
//   revert - a revert
//   listed - named with nothing that says what it is
//
// A "feat:" or "fix:" prefix counts as an implementation only in a commit subject. Inside a
// squashed daily those lines are the individual commits of a task PR, listed under its
// "[Type] KAN-N: title (#PR)" line, and say nothing about the task type.
function classify(rawLine, { prefixIsType = true } = {}) {
  const line = rawLine.replace(BULLET, "").trim();
  const bracket = (line.match(/\[([^\]]+)\]/) || [])[1];
  const prefix = (line.match(CONVENTIONAL) || [])[1];
  const merge = line.match(
    new RegExp(
      `^Merge pull request #(\\d+) from \\S*?\\/?(new-feature|enhancement|technical-improvement|bug-fix)\\/${PROJECT_KEY}-\\d+-?(\\S*)`,
    ),
  );

  let kind = "listed";
  let type = null;
  if (/\brevert/i.test(line)) kind = "revert";
  else if (/\b(delete|remove) (the )?(completed )?task folder\b/i.test(line)) kind = "done";
  else if (taskType(bracket)) [kind, type] = ["impl", taskType(bracket)];
  else if (
    bracket === "Engineering" ||
    bracket === "Product" ||
    /task spec|product brief/i.test(line) ||
    prefix === "docs"
  )
    kind = "spec";
  else if (prefixIsType && PREFIX_TYPES[prefix]) [kind, type] = ["impl", PREFIX_TYPES[prefix]];
  else if (merge) [kind, type] = ["branch", BRANCH_TYPES[merge[2]]];

  const title = merge
    ? `${merge[3]} (#${merge[1]})`
    : line
        .replace(CONVENTIONAL, "")
        .replace(/\[[^\]]+\]/g, "")
        .replace(KEY, "")
        .replace(/\(\s*\)/g, "")
        .replace(/^[\s:—–-]+/, "")
        .replace(/\s+/g, " ")
        .trim();
  return { kind, type, title, pullRequest: (line.match(/\(#(\d+)\)/) || [])[1] ?? (merge ? merge[1] : null) };
}

function mentionsIn(line, from) {
  const keys = keysIn(line);
  if (keys.length === 0) return [];
  const info = classify(line, { prefixIsType: from.via === "subject" });
  return keys.map((key) => ({ key, ...info, from }));
}

// commits: [{ sha, subject, body, onBase }]; prBodies: Map of daily PR number -> description.
function collectMentions(commits, prBodies = new Map()) {
  const mentions = [];
  for (const commit of commits) {
    const from = { sha: commit.sha, subject: commit.subject, onBase: commit.onBase || null };
    mentions.push(...mentionsIn(commit.subject, { ...from, via: "subject" }));
    if (!isDaily(commit.subject)) continue;
    for (const line of commit.body.split("\n").filter(isListLine)) {
      mentions.push(...mentionsIn(line, { ...from, via: "commit body" }));
    }
    const pullRequest = (commit.subject.match(/\(#(\d+)\)\s*$/) || [])[1];
    const description = pullRequest ? prBodies.get(pullRequest) : undefined;
    for (const line of (description || "").split("\n").filter(isListLine)) {
      mentions.push(...mentionsIn(line, { ...from, via: "PR description" }));
    }
  }
  return mentions;
}

function buildScope(mentions) {
  const byKey = new Map();
  for (const mention of mentions) {
    if (!byKey.has(mention.key)) byKey.set(mention.key, []);
    byKey.get(mention.key).push(mention);
  }
  const tickets = [...byKey.entries()].map(([key, all]) => {
    const impl = all.filter((m) => m.kind === "impl");
    const done = all.filter((m) => m.kind === "done");
    const hinted = all.filter((m) => m.kind === "branch");
    const types = [...new Set((impl.length ? impl : hinted).map((m) => m.type))];
    // One entry per task PR: the squash body and the PR description both name it.
    const seen = new Set();
    const entries = impl.filter((m) => {
      const id = m.pullRequest ? `#${m.pullRequest}` : `${m.from.sha}:${m.title}`;
      return !seen.has(id) && seen.add(id);
    });
    const evidence = [...impl, ...done];
    let status = "listed";
    if (evidence.length) status = "implemented";
    else if (all.some((m) => m.kind === "spec")) status = "spec";
    return {
      key,
      status,
      types,
      entries,
      reverts: all.filter((m) => m.kind === "revert"),
      mentions: all,
      // Set when every implementation commit is already on the base ref: a hotfix that went to
      // production and develop separately.
      onBase: evidence.length > 0 && evidence.every((m) => m.from.onBase) ? evidence[0].from.onBase : null,
    };
  });
  return tickets.sort((a, b) => Number(a.key.slice(4)) - Number(b.key.slice(4)));
}

const sourceLabel = (from) => (isDaily(from.subject) ? `in ${from.subject}` : from.sha.slice(0, 8));

function formatScope(tickets, { base, head, commitCount, dailies }) {
  const lines = [
    `Release scope ${base}..${head}: ${commitCount} commits, ${dailies.length} squashed daily PR(s) expanded`,
  ];
  for (const daily of dailies) lines.push(`  ${daily.sha.slice(0, 8)} ${daily.subject}`);

  const implemented = tickets.filter((t) => t.status === "implemented");
  const pad = Math.max(8, ...tickets.map((t) => t.key.length));
  lines.push("", `Implemented (${implemented.length})`);
  for (const ticket of implemented) {
    const type = (ticket.types.join(" + ") || "Unknown type").padEnd(12);
    const [first, ...rest] = ticket.entries;
    const fallback = ticket.mentions.find((m) => m.kind === "branch") || ticket.mentions.find((m) => m.kind === "done");
    const notes = [];
    if (ticket.onBase) notes.push(`already on ${base} as ${ticket.onBase}`);
    if (ticket.reverts.length) notes.push(`also reverted: ${ticket.reverts.map((m) => m.title).join("; ")}`);
    const note = notes.length ? `  ** ${notes.join("; ")}` : "";
    const describe = (m) => `${m.title || m.from.subject}  [${sourceLabel(m.from)}]`;
    lines.push(`${ticket.key.padEnd(pad)}  ${type}  ${describe(first || fallback)}${note}`);
    for (const more of rest) lines.push(`${"".padEnd(pad)}  ${"".padEnd(12)}  ${describe(more)}`);
  }

  const counts = TASK_TYPES.map((type) => `${type} ${implemented.filter((t) => t.types.includes(type)).length}`);
  lines.push("", `By type: ${counts.join(", ")}`);

  const specOnly = tickets.filter((t) => t.status === "spec");
  lines.push("", `Task spec or docs only, no implementation in range (${specOnly.length})`);
  lines.push(specOnly.length ? specOnly.map((t) => t.key).join(", ") : "None");

  const listed = tickets.filter((t) => t.status === "listed");
  if (listed.length) {
    lines.push("", `Named without a type or a task spec, check by hand (${listed.length})`);
    for (const ticket of listed) {
      const m = ticket.reverts[0] || ticket.mentions[0];
      lines.push(`${ticket.key.padEnd(pad)}  ${m.from.sha.slice(0, 8)} ${m.from.subject}  [${m.from.via}]`);
    }
  }
  return lines.join("\n");
}

// ---- git and gh ---------------------------------------------------------------------------

const RECORD = "\x1e";
const FIELD = "\x1f";

const gitLog = (args, cwd) =>
  execFileSync("git", ["log", ...args], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .split(RECORD)
    .slice(1)
    .map((record) => record.split(FIELD));

function readCommits(base, head, cwd = process.cwd()) {
  // A hotfix reaches the base ref (production) as its own commit, so its ticket is still in
  // base..head although it has shipped. Those commits keep their subject, PR number included.
  const onBase = new Map();
  for (const [sha, subject] of gitLog([`--format=${RECORD}%H${FIELD}%s`, "--no-merges", `${head}..${base}`], cwd)) {
    onBase.set(subject.trim(), sha.slice(0, 8));
  }
  return gitLog([`--format=${RECORD}%H${FIELD}%P${FIELD}%s${FIELD}%b`, `${base}..${head}`], cwd).map(
    ([sha, parents, subject, body]) => ({
      sha,
      parents: parents.split(" ").filter(Boolean),
      subject,
      body: body || "",
      onBase: onBase.get(subject.trim()) || null,
    }),
  );
}

function readPrBody(pullRequest, cwd = process.cwd()) {
  return execFileSync("gh", ["pr", "view", pullRequest, "--json", "body", "--jq", ".body"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
}

function parseArgs(argv) {
  const useGh = !argv.includes("--no-gh");
  const refs = argv.filter((arg) => !arg.startsWith("--"));
  const [base, head] = refs.length === 1 && refs[0].includes("..") ? refs[0].split(/\.{2,3}/) : refs;
  return { base: base || "origin/production", head: head || "origin/develop", useGh };
}

function main(argv) {
  const { base, head, useGh } = parseArgs(argv);
  const commits = readCommits(base, head);
  const dailies = commits.filter((c) => isDaily(c.subject) && c.parents.length === 1);

  const prBodies = new Map();
  for (const daily of dailies) {
    const pullRequest = (daily.subject.match(/\(#(\d+)\)\s*$/) || [])[1];
    if (!pullRequest) {
      console.error(
        `note: ${daily.sha.slice(0, 8)} "${daily.subject}" names no pull request; read from the commit body only.`,
      );
    } else if (!useGh) {
      console.error(
        `note: --no-gh, PR #${pullRequest} description not read; ${daily.sha.slice(0, 8)} read from the commit body only.`,
      );
    } else {
      try {
        prBodies.set(pullRequest, readPrBody(pullRequest));
      } catch (error) {
        const reason = String(error.stderr || error.message)
          .trim()
          .split("\n")[0];
        console.error(
          `note: could not read PR #${pullRequest} description (gh missing, not signed in, or offline: ${reason}); ` +
            `${daily.sha.slice(0, 8)} read from the commit body only.`,
        );
      }
    }
  }

  const tickets = buildScope(collectMentions(commits, prBodies));
  console.log(formatScope(tickets, { base, head, commitCount: commits.length, dailies }));
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { classify, collectMentions, buildScope, formatScope, parseArgs, readCommits };
