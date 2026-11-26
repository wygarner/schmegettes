#!/usr/bin/env bash
# Scan the full git history (every local and remote-tracking ref) for secrets, before the
# repository is made public. Uses the same gitleaks version and .gitleaks.toml as CI.
#
#   scripts/history-scan.sh <report.json outside the repository>
#
# Prints only redacted, aggregate results: finding counts per rule and per file, and the
# number of distinct commit author/committer emails with their domains (never full
# addresses). The JSON report is redacted too, but keep it out of the repository and
# delete it once the findings are classified. Never paste matched values anywhere.
set -euo pipefail

GITLEAKS_VERSION="8.30.1"

report="${1:-}"
if [ -z "$report" ]; then
  echo "usage: scripts/history-scan.sh <report.json outside the repository>" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
report_dir="$(cd "$(dirname "$report")" && pwd -P)"
case "$report_dir/" in
  "$(cd "$repo_root" && pwd -P)/"*)
    echo "error: write the report outside the repository" >&2
    exit 2
    ;;
esac
report="$report_dir/$(basename "$report")"

cd "$repo_root"
echo "Scanning $(git rev-list --all | wc -l | tr -d ' ') commits across all refs with gitleaks $GITLEAKS_VERSION"

status=0
mise exec "aqua:gitleaks/gitleaks@$GITLEAKS_VERSION" -- gitleaks git . \
  --config .gitleaks.toml \
  --log-opts="--all" \
  --redact \
  --no-banner \
  --log-level error \
  --report-format json \
  --report-path "$report" || status=$?

if [ "$status" -ne 0 ] && [ "$status" -ne 1 ]; then
  echo "error: gitleaks failed (exit $status)" >&2
  exit "$status"
fi

node - "$report" <<'NODE'
const findings = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8")) ?? [];
const count = (key) =>
  Object.entries(findings.reduce((acc, f) => ({ ...acc, [f[key]]: (acc[f[key]] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `  ${n}  ${name}`)
    .join("\n");
console.log(`\nFindings: ${findings.length}`);
if (findings.length > 0) {
  console.log(`By rule:\n${count("RuleID")}`);
  console.log(`By file:\n${count("File")}`);
}
NODE

emails="$(git log --all --format='%ae%n%ce' | sort -u)"
echo
echo "Distinct commit author/committer emails: $(printf '%s\n' "$emails" | grep -c .)"
echo "Domains:"
printf '%s\n' "$emails" | sed -n 's/.*@//p' | sort | uniq -c | sort -rn | sed 's/^/  /'

exit "$status"
