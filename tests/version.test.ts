import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isNewerVersion, normalizeVersion } from "../src/lib/version.ts";

test("normalizeVersion strips the v prefix and trims", () => {
  assert.equal(normalizeVersion(" v1.3.0 "), "1.3.0");
  assert.equal(normalizeVersion("1.3.0"), "1.3.0");
  assert.equal(normalizeVersion(""), "");
  assert.equal(normalizeVersion(null), "");
  assert.equal(normalizeVersion(undefined), "");
});

test("isNewerVersion compares major.minor.patch", () => {
  assert.ok(isNewerVersion("1.2.1", "1.3.0"));
  assert.ok(isNewerVersion("1.2.1", "v1.3.0"));
  assert.ok(isNewerVersion("1.2.1", "2.0.0"));
  assert.ok(isNewerVersion("1.2.1", "1.2.2"));
  assert.ok(!isNewerVersion("1.3.0", "1.2.1"));
  assert.ok(!isNewerVersion("1.3.0", "1.3.0"));
  assert.ok(!isNewerVersion("1.3.0", "v1.3.0"));
});

test("isNewerVersion treats missing parts as zero", () => {
  assert.ok(isNewerVersion("1.2", "1.2.1"));
  assert.ok(!isNewerVersion("1.2.1", "1.2"));
  assert.ok(isNewerVersion("1", "1.0.1"));
});

test("isNewerVersion ignores pre-release suffixes by numeric prefix", () => {
  assert.ok(isNewerVersion("1.3.0", "1.4.0-beta.1"));
  assert.ok(!isNewerVersion("1.4.0-beta.1", "1.4.0"));
});

test("isNewerVersion handles garbage", () => {
  assert.ok(!isNewerVersion("1.3.0", ""));
  assert.ok(!isNewerVersion("1.3.0", "not-a-version"));
  assert.ok(!isNewerVersion("1.3.0", "latest"));
});

test("root and desktop-shell package versions never drift (release-integrity guard)", () => {
  // The v1.7.3 release shipped 1.7.2-named installers because only the
  // root package.json was bumped: electron-builder takes its version —
  // exe name, latest.yml, the auto-update comparison — from
  // desktop/package.json. Both must always say the same thing.
  const read = (p: string) =>
    JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), p), "utf8")).version;
  const root = read("../package.json");
  const desktop = read("../desktop/package.json");
  assert.equal(root, desktop, `root (${root}) and desktop (${desktop}) versions must match`);
  assert.match(root, /^\d+\.\d+\.\d+$/);
});
