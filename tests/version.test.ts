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

test("ALL five version sources agree (release-integrity guard, v1.7.9)", () => {
  // The v1.7.8 release shipped a player fix built from a pre-audit
  // commit while the repo already carried 1.7.8 in five places that can
  // drift independently — and the renderer's update banner (version.ts)
  // compares a DIFFERENT file than electron-updater (desktop/package.json).
  // One source of truth, asserted everywhere: root package.json,
  // desktop/package.json, src/lib/version.ts, tauri.conf.json, Cargo.toml.
  const base = join(dirname(fileURLToPath(import.meta.url)), "..");
  const root = JSON.parse(readFileSync(join(base, "package.json"), "utf8")).version;
  const desktop = JSON.parse(readFileSync(join(base, "desktop/package.json"), "utf8")).version;
  const tauri = JSON.parse(readFileSync(join(base, "desktop-tauri/src-tauri/tauri.conf.json"), "utf8")).version;
  const versionTs = readFileSync(join(base, "src/lib/version.ts"), "utf8");
  const appVersion = versionTs.match(/APP_VERSION = "([^"]+)"/)?.[1];
  const cargo = readFileSync(join(base, "desktop-tauri/src-tauri/Cargo.toml"), "utf8");
  const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
  const all = [
    ["package.json", root],
    ["desktop/package.json", desktop],
    ["src/lib/version.ts", appVersion],
    ["tauri.conf.json", tauri],
    ["Cargo.toml", cargoVersion],
  ] as const;
  for (const [name, v] of all) {
    assert.ok(v, `${name} must carry a version`);
    assert.match(v as string, /^\d+\.\d+\.\d+$/, `${name} version must be semver`);
  }
  const distinct = new Set(all.map(([, v]) => v));
  assert.equal(
    distinct.size,
    1,
    `version drift across ${all.map(([n, v]) => `${n}=${v}`).join(", ")}`
  );
});
