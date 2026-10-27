"use strict";
// Run with: node --test scripts/release-scope.test.cjs
const assert = require("node:assert/strict");
const { test } = require("node:test");
// Fixtures use the key KAN; the script reads the key from this variable before .github/jira.json.
process.env.JIRA_PROJECT_KEY = "KAN";
const { classify, collectMentions, buildScope, formatScope, parseArgs } = require("./release-scope.cjs");

const commit = (subject, body = "", extra = {}) => ({
  sha: "a".repeat(40),
  parents: ["p"],
  subject,
  body,
  onBase: null,
  ...extra,
});
const scopeOf = (commits, prBodies) => buildScope(collectMentions(commits, prBodies));
const byKey = (tickets) => Object.fromEntries(tickets.map((t) => [t.key, t]));

// The shape GitHub gives a squashed daily: each task PR's squash subject, then its own commits.
const squashedDailyBody = [
  "* [Engineering] KAN-501: task spec (#11)",
  "",
  "* docs: fill task spec for some-task",
  "",
  "* chore: assign jira key [skip ci]",
  "",
  "* [Enhancement] KAN-501: some task (#12)",
  "",
  "* feat(KAN-501): add the thing",
  "",
  "* chore: delete task folder for KAN-501",
  "",
  "* [Technical Improvement] KAN-502: other task (release 1) (#13)",
  "",
  "* [Technical Improvement] KAN-502: other task (release 2) (#14)",
  "",
  "* [Engineering] KAN-503: task spec (#15)",
  "",
  "Follow-up to KAN-999, which is not a task line.",
].join("\n");

test("classify reads the task type from the PR title, a commit prefix, or a task branch merge", () => {
  assert.deepEqual(classify("[Bug Fix] KAN-403: webhook-replay-idempotency (#1589)"), {
    kind: "impl",
    type: "Bug Fix",
    title: "webhook-replay-idempotency (#1589)",
    pullRequest: "1589",
  });
  assert.equal(classify("* [Technical Improvement] KAN-418: ci-pipeline-hardening (#1604)").type, "Improvement");
  assert.equal(
    classify("- KAN-424 — [Improvement] audited staff organization access (#1639)").title,
    "audited staff organization access (#1639)",
  );
  assert.equal(classify("fix(KAN-402): keep package imports working (#1591)").type, "Bug Fix");
  assert.equal(classify("* feat(KAN-415): add withOrg", { prefixIsType: false }).kind, "listed");
  assert.equal(classify("[Engineering] KAN-441: task spec (#1666)").kind, "spec");
  assert.equal(classify("chore: delete task folder for KAN-405").kind, "done");
  assert.equal(classify("chore: remove abandoned KAN-276 and KAN-277 task folders").kind, "listed");
  assert.equal(classify("[Bug Fix] Revert KAN-440: restore the Jira workflows (#1704)").kind, "revert");
  assert.deepEqual(
    classify("Merge pull request #1555 from Everlo-Software/technical-improvement/KAN-405-prisma-7-upgrade"),
    {
      kind: "branch",
      type: "Improvement",
      title: "prisma-7-upgrade (#1555)",
      pullRequest: "1555",
    },
  );
});

test("a squashed daily yields every ticket in its body, typed by the task PR title", () => {
  const tickets = byKey(scopeOf([commit("[Daily] 2026-10-09 (#1617)", squashedDailyBody)]));
  assert.deepEqual(Object.keys(tickets), ["KAN-501", "KAN-502", "KAN-503"]);
  assert.equal(tickets["KAN-501"].status, "implemented");
  assert.deepEqual(tickets["KAN-501"].types, ["Enhancement"]);
  assert.deepEqual(tickets["KAN-502"].types, ["Improvement"]);
  assert.deepEqual(
    tickets["KAN-502"].entries.map((e) => e.pullRequest),
    ["13", "14"],
  );
  assert.equal(tickets["KAN-503"].status, "spec");
});

test("the PR description adds tickets the commit body lacks and does not duplicate the rest", () => {
  const description = [
    "## Merged today",
    "- KAN-501: some task (#12)",
    "- KAN-504 — [Bug Fix] only in the description (#16)",
    "- KAN-505 (#17), KAN-506 (#18)",
    "KAN-998 is mentioned in prose only.",
  ].join("\n");
  const tickets = byKey(
    scopeOf([commit("[Daily] 2026-10-09 (#1617)", squashedDailyBody)], new Map([["1617", description]])),
  );
  assert.deepEqual(Object.keys(tickets), ["KAN-501", "KAN-502", "KAN-503", "KAN-504", "KAN-505", "KAN-506"]);
  assert.equal(tickets["KAN-501"].entries.length, 1);
  assert.deepEqual(tickets["KAN-504"].types, ["Bug Fix"]);
  assert.equal(tickets["KAN-505"].status, "listed");
});

test("ordinary commits are read from the subject only", () => {
  const tickets = byKey(
    scopeOf([
      commit("[Improvement] KAN-510: a task (#20)", "* chore: delete task folder for KAN-510\n* relates to KAN-997"),
      commit("[Engineering] KAN-511: task spec (#21)"),
      commit("chore: delete task folder for KAN-512"),
      commit("Merge pull request #22 from Everlo-Software/bug-fix/KAN-512-a-fix", "", { parents: ["p", "q"] }),
      commit("build(deps): bump diff from 7.0.0 to 9.0.0 (#23)"),
    ]),
  );
  assert.deepEqual(Object.keys(tickets), ["KAN-510", "KAN-511", "KAN-512"]);
  assert.equal(tickets["KAN-511"].status, "spec");
  assert.equal(tickets["KAN-512"].status, "implemented");
  assert.deepEqual(tickets["KAN-512"].types, ["Bug Fix"]);
});

test("a ticket whose only implementation commit is already on the base ref is marked", () => {
  const commits = [
    commit("[Enhancement] KAN-520: hotfixed (#30)", "", { onBase: "d413ad71" }),
    commit("[Enhancement] KAN-521: half shipped, part 1 (#31)", "", { onBase: "d413ad72" }),
    commit("[Enhancement] KAN-521: half shipped, part 2 (#32)"),
  ];
  const tickets = scopeOf(commits);
  assert.equal(byKey(tickets)["KAN-520"].onBase, "d413ad71");
  assert.equal(byKey(tickets)["KAN-521"].onBase, null);
  const text = formatScope(tickets, { base: "origin/production", head: "origin/develop", commitCount: 3, dailies: [] });
  assert.match(text, /KAN-520 .*already on origin\/production as d413ad71/);
  assert.match(text, /By type: New Feature 0, Enhancement 2, Improvement 0, Bug Fix 0/);
});

test("parseArgs accepts two refs, a range, or nothing", () => {
  assert.deepEqual(parseArgs([]), { base: "origin/production", head: "origin/develop", useGh: true });
  assert.deepEqual(parseArgs(["v1", "v2", "--no-gh"]), { base: "v1", head: "v2", useGh: false });
  assert.deepEqual(parseArgs(["origin/production..origin/develop"]), {
    base: "origin/production",
    head: "origin/develop",
    useGh: true,
  });
});
