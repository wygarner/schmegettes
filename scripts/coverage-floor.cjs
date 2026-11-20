"use strict";
// Fails when a Go package group's statement coverage is below its floor.
//
// Floors are in scripts/coverage-floors.json, keyed by repo-relative package path. A key ending
// in "/" is a prefix and is measured as one group (statements weighted across its packages);
// any other key is one package. Groups with no packages in the profile are skipped, so each CI
// job passes only its own coverage.out. Rules: docs/system-docs/engineering/testing-strategy.md §3.
//
// Usage: node scripts/coverage-floor.cjs <coverage.out> [more.out …]
// Test:  node --test scripts/coverage-floor.test.cjs
const fs = require("node:fs");
const path = require("node:path");

// Go module paths are "schmegettes/<dir>", so the repo-relative path is what follows.
const MODULE_PREFIX = "schmegettes/";

/** Parses Go cover profiles into Map(blockKey -> { pkg, stmts, covered }). */
function parseProfiles(texts) {
  const blocks = new Map();
  for (const text of texts) {
    for (const line of text.split("\n")) {
      const m = line.match(/^(.+):(\d+\.\d+,\d+\.\d+) (\d+) (\d+)$/);
      if (!m) continue;
      const [, file, range, stmts, count] = m;
      const key = `${file}:${range}`;
      const rel = file.startsWith(MODULE_PREFIX) ? file.slice(MODULE_PREFIX.length) : file;
      const prev = blocks.get(key);
      const covered = Number(count) > 0 || Boolean(prev?.covered);
      blocks.set(key, { pkg: path.posix.dirname(rel), stmts: Number(stmts), covered });
    }
  }
  return blocks;
}

const matches = (key, pkg) => (key.endsWith("/") ? `${pkg}/`.startsWith(key) : pkg === key);

/** One row per floor that has data: { key, floor, percent, stmts, ok }. */
function check(blocks, floors) {
  const rows = [];
  for (const [key, floor] of Object.entries(floors)) {
    let stmts = 0;
    let covered = 0;
    for (const b of blocks.values()) {
      if (!matches(key, b.pkg)) continue;
      stmts += b.stmts;
      if (b.covered) covered += b.stmts;
    }
    if (stmts === 0) continue;
    const percent = Math.floor((covered / stmts) * 1000) / 10;
    rows.push({ key, floor, percent, stmts, ok: percent >= floor });
  }
  return rows;
}

function format(rows) {
  if (rows.length === 0) return "No coverage floor applies to these packages.";
  const pad = Math.max(...rows.map((r) => r.key.length));
  return rows
    .map((r) => `${r.ok ? "ok  " : "FAIL"} ${r.key.padEnd(pad)}  ${String(r.percent).padStart(5)}%  (floor ${r.floor}%)`)
    .join("\n");
}

function main(argv) {
  if (argv.length === 0) {
    console.error("usage: node scripts/coverage-floor.cjs <coverage.out> [more.out …]");
    return 2;
  }
  const floors = JSON.parse(fs.readFileSync(path.join(__dirname, "coverage-floors.json"), "utf8")).floors;
  const rows = check(parseProfiles(argv.map((f) => fs.readFileSync(f, "utf8"))), floors);
  console.log(format(rows));
  const failed = rows.filter((r) => !r.ok);
  for (const r of failed) console.error(`::error::${r.key} coverage ${r.percent}% is below its floor of ${r.floor}%`);
  return failed.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { parseProfiles, check, format, matches };
