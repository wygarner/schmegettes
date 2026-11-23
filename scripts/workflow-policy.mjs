// Static safety policy for .github/workflows/*.yml, checked before the repository is public.
// Run with: node scripts/workflow-policy.mjs   (tests: scripts/workflow-policy.test.mjs)
//
// The repo-scripts CI job installs no packages, so this reads the workflow subset the repo
// uses (block mappings, block scalars, flow lists) line by line instead of with a YAML library.
// Rules (docs/system-docs/security/security-model.md, "Public repository"):
//   no-untrusted-trigger  no pull_request_target or workflow_run trigger
//   permissions           top-level permissions, or permissions on every job
//   pinned-action         every non-local `uses:` is pinned to a full 40-character commit SHA
//   run-injection         no untrusted expression interpolated into a `run:` script
//   fork-guard            a job with write permissions or secrets that a pull_request can start
//                         carries the trusted-PR guard
//   hosted-runner         no self-hosted runner
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const TRUSTED_PR_GUARD = "github.event.pull_request.head.repo.full_name == github.repository";

const UNTRUSTED_EXPRESSIONS = [
  /github\.event\.pull_request\.(title|body|head\.ref|head\.label)/,
  /github\.head_ref/,
  /github\.event\.issue\./,
  /github\.event\.comment\./,
  /github\.event\.review\./,
  /github\.event\.commits/,
  /github\.event\.head_commit/,
  /\binputs\./,
];

const indentOf = (line) => line.length - line.trimStart().length;
const isBlank = (line) => line.trim() === "" || line.trimStart().startsWith("#");
const stripComment = (value) => value.replace(/\s+#.*$/, "").trim();

// Lines after `start` that are more indented than `parentIndent` (blank lines included).
function blockAfter(lines, start, parentIndent) {
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== "" && indentOf(line) <= parentIndent) break;
    out.push({ line, index: i });
  }
  return out;
}

// Direct child keys of a block mapping: [{ key, value, index, indent }].
function childKeys(block) {
  const content = block.filter(({ line }) => !isBlank(line));
  if (content.length === 0) return [];
  const indent = indentOf(content[0].line);
  return content
    .filter(({ line }) => indentOf(line) === indent && !line.trimStart().startsWith("- "))
    .map(({ line, index }) => {
      const match = line.trim().match(/^("?[^":]+"?):(?:\s+(.*))?$/);
      return match ? { key: match[1].replace(/"/g, ""), value: stripComment(match[2] ?? ""), index, indent } : null;
    })
    .filter(Boolean);
}

function triggersOf(lines, top) {
  const on = top.find((k) => k.key === "on" || k.key === "true");
  if (!on) return [];
  if (on.value) {
    return on.value
      .replace(/[[\]]/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return childKeys(blockAfter(lines, on.index, on.indent)).map((k) => k.key);
}

// The text of a key's value: the inline value, or the block scalar/mapping under it.
function valueText(lines, entry) {
  const block = blockAfter(lines, entry.index, entry.indent).map(({ line }) => line.trim());
  return [entry.value, ...block].join("\n");
}

function hasWritePermission(text) {
  return /\bwrite-all\b/.test(text) || /:\s*write\b/.test(text);
}

export function checkWorkflow(file, text) {
  const lines = text.split("\n");
  const violations = [];
  const report = (rule, job, message) => violations.push({ file, job, rule, message });

  const top = childKeys(lines.map((line, index) => ({ line, index })));
  const triggers = triggersOf(lines, top);
  for (const bad of ["pull_request_target", "workflow_run"]) {
    if (triggers.includes(bad)) report("no-untrusted-trigger", null, `triggers on ${bad}`);
  }
  const prTriggered = triggers.includes("pull_request");
  const topPermissions = top.find((k) => k.key === "permissions");
  const topPermissionText = topPermissions ? valueText(lines, topPermissions) : "";

  // Every `uses:` line, in steps or as a reusable-workflow job.
  lines.forEach((line) => {
    const match = line.match(/^\s*(?:-\s+)?uses:\s*(\S+)/);
    if (!match) return;
    const ref = match[1].replace(/["']/g, "");
    if (ref.startsWith("./")) return;
    const pinned = ref.startsWith("docker://") ? /@sha256:[0-9a-f]{64}$/.test(ref) : /@[0-9a-f]{40}$/.test(ref);
    if (!pinned) report("pinned-action", null, `${ref} is not pinned to a full commit SHA`);
  });

  // Every `run:` script, inline or block scalar.
  lines.forEach((line, index) => {
    const match = line.match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!match) return;
    const script = [match[2], ...blockAfter(lines, index, indentOf(line)).map((l) => l.line)].join("\n");
    for (const expression of script.match(/\$\{\{[^}]*\}\}/g) ?? []) {
      if (UNTRUSTED_EXPRESSIONS.some((pattern) => pattern.test(expression))) {
        report(
          "run-injection",
          null,
          `line ${index + 1} interpolates ${expression} into a script; pass it through env:`,
        );
      }
    }
  });

  const jobsEntry = top.find((k) => k.key === "jobs");
  const jobs = jobsEntry ? childKeys(blockAfter(lines, jobsEntry.index, jobsEntry.indent)) : [];
  for (const job of jobs) {
    const body = blockAfter(lines, job.index, job.indent);
    const keys = childKeys(body);
    const get = (key) => keys.find((k) => k.key === key);
    const bodyText = body.map(({ line }) => line).join("\n");

    const jobPermissions = get("permissions");
    if (!jobPermissions && !topPermissions) {
      report("permissions", job.key, "no permissions at workflow or job level");
    }

    const runsOn = get("runs-on");
    if (runsOn && /self-hosted/.test(valueText(lines, runsOn))) {
      report("hosted-runner", job.key, "uses a self-hosted runner");
    }

    if (prTriggered) {
      const permissionText = jobPermissions ? valueText(lines, jobPermissions) : topPermissionText;
      const usesSecrets =
        /secrets:\s*inherit/.test(bodyText) ||
        [...bodyText.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].some((m) => m[1] !== "GITHUB_TOKEN");
      const condition = get("if") ? valueText(lines, get("if")) : "";
      if ((hasWritePermission(permissionText) || usesSecrets) && !condition.includes(TRUSTED_PR_GUARD)) {
        report(
          "fork-guard",
          job.key,
          `can run on pull_request with ${usesSecrets ? "secrets" : "write permissions"} but has no trusted-PR guard`,
        );
      }
    }
  }
  return violations;
}

export function checkDirectory(dir) {
  return readdirSync(dir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .flatMap((name) => checkWorkflow(name, readFileSync(join(dir, name), "utf8")));
}

export const formatViolation = (v) => `${v.file}${v.job ? ` (job ${v.job})` : ""}: [${v.rule}] ${v.message}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = join(fileURLToPath(new URL("..", import.meta.url)), ".github", "workflows");
  const violations = checkDirectory(dir);
  for (const v of violations) console.error(formatViolation(v));
  console.log(violations.length === 0 ? "Workflow policy: all workflows pass" : `${violations.length} violation(s)`);
  process.exitCode = violations.length === 0 ? 0 : 1;
}
