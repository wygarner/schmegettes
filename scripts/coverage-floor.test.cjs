"use strict";
// Run with: node --test scripts/coverage-floor.test.cjs
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseProfiles, check, format, matches } = require("./coverage-floor.cjs");

const profile = [
  "mode: atomic",
  "schmegettes/game/internal/play/board.go:10.2,12.3 6 1",
  "schmegettes/game/internal/play/board.go:14.2,16.3 4 0",
  "schmegettes/api/internal/rooms/handler.go:1.1,2.2 3 1",
  "schmegettes/api/internal/rooms/handler.go:3.1,4.2 1 0",
  "schmegettes/api/cmd/api/main.go:1.1,9.2 6 0",
].join("\n");

test("groups by prefix, weights by statements, and checks floors", () => {
  const rows = check(parseProfiles([profile]), {
    "game/internal/play": 60,
    "api/": 30,
    "golib/": 80,
  });
  assert.deepEqual(rows, [
    { key: "game/internal/play", floor: 60, percent: 60, stmts: 10, ok: true },
    // 3 of 10 api statements are covered: 30%, exactly the floor.
    { key: "api/", floor: 30, percent: 30, stmts: 10, ok: true },
  ]);
});

test("a package below its floor fails", () => {
  const rows = check(parseProfiles([profile]), { "game/internal/play": 61 });
  assert.equal(rows[0].ok, false);
  assert.match(format(rows), /^FAIL game\/internal\/play\s+60%  \(floor 61%\)$/);
});

test("deleting a package's tests drops it below the floor", () => {
  const untested = profile.replace("board.go:10.2,12.3 6 1", "board.go:10.2,12.3 6 0");
  const [row] = check(parseProfiles([untested]), { "game/internal/play": 80 });
  assert.equal(row.percent, 0);
  assert.equal(row.ok, false);
});

test("a block counted in two profiles is covered if either run covered it", () => {
  const other = "mode: atomic\nschmegettes/game/internal/play/board.go:14.2,16.3 4 3";
  const [row] = check(parseProfiles([profile, other]), { "game/internal/play": 100 });
  assert.equal(row.percent, 100);
});

test("an exact key matches one package; a prefix matches its subpackages only", () => {
  assert.equal(matches("game/internal/play", "game/internal/play"), true);
  assert.equal(matches("game/internal/play", "game/internal/playback"), false);
  assert.equal(matches("api/", "api/internal/rooms"), true);
  assert.equal(matches("api/", "apix/thing"), false);
});
