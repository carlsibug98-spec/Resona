import { test } from "node:test";
import assert from "node:assert/strict";
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
