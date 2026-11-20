import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * v1.7.10 — startup update policy regression guard ("download on start up").
 *
 * v1.7.9 ran the whole update on the splash (autoDownload + quitAndInstall
 * before the server even booted): every launch with a pending update held
 * the app up to 30 s on "Downloading update… %", and a fast connection saw
 * the app close itself before it ever opened — if the silent installer then
 * failed, the next launch started the same ~155 MB download all over again.
 *
 * The v1.7.10 policy: the boot path (splash → server → window) contains no
 * updater calls at all; the updater only boots AFTER the window is up
 * (beginBackgroundUpdate); a downloaded update is applied restart-first
 * through the banner (installAndRestart) or the quit path — never by
 * killing the app before it opened.
 *
 * The wiring lives in desktop/main.js (an Electron main process, not
 * renderable under node:test), so this asserts the source, in the style of
 * tests/playback-failure-policy.test.ts.
 */

const dir = dirname(fileURLToPath(import.meta.url));
const mainSrc = readFileSync(join(dir, "../desktop/main.js"), "utf8");
const preloadSrc = readFileSync(join(dir, "../desktop/preload.js"), "utf8");
const bannerSrc = readFileSync(join(dir, "../src/components/UpdateBanner.tsx"), "utf8");

/** strip /* *\/ and // comments so policy prose never false-positives */
const code = mainSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function whenReadyBody(): string {
  const m = code.match(/app\.whenReady\(\)\.then\(async \(\) => \{([\s\S]*?)\n  \}\);/);
  assert.ok(m, "expected app.whenReady().then(async () => { … }) in desktop/main.js");
  return m[1];
}

test("the boot path never runs the updater: splash → server → window only", () => {
  const body = whenReadyBody();
  assert.ok(!body.includes("autoUpdater"), "app.whenReady must not touch autoUpdater");
  assert.ok(!body.includes("checkForUpdates"), "app.whenReady must not check for updates");
  assert.ok(!body.includes("installAndRestart"), "app.whenReady must never install");
  assert.ok(body.includes("await createWindow(port)"), "the window must open");
});

test("the updater boots only after the window is up", () => {
  assert.ok(code.includes("function beginBackgroundUpdate"), "beginBackgroundUpdate must exist");
  const afterWindow = code.indexOf("await createWindow(port)");
  assert.ok(afterWindow > 0, "createWindow call site must exist");
  const callAt = code.indexOf("beginBackgroundUpdate();", afterWindow);
  assert.ok(
    callAt > afterWindow,
    "beginBackgroundUpdate() must run after createWindow resolves"
  );
});

test("no startup download: the old splash-phase updater is gone", () => {
  assert.ok(!code.includes("function startupUpdate"), "startupUpdate must be gone");
  assert.ok(!/installAndRestart\("startup"\)/.test(code), "no splash-phase install");
  assert.ok(!code.includes("UPDATE_WAIT_MS"), "no splash download wait cap");
});

test("autoInstallOnAppQuit stays enabled as the quit-path fallback", () => {
  assert.ok(
    code.includes("autoUpdater.autoInstallOnAppQuit = true"),
    "silent apply on quit must remain the no-interaction fallback"
  );
});

test("restart-first apply: install-now routes through installAndRestart", () => {
  const m = code.match(/ipcMain\.on\("update:install-now", \(\) => \{([\s\S]*?)\}\);/);
  assert.ok(m, "update:install-now handler must exist");
  assert.ok(
    m[1].includes("installAndRestart"),
    "install-now must call the quit → install → relaunch sequence"
  );
  assert.ok(
    code.includes("quitAndInstall(true, true)"),
    "silent install + force-run must be intact"
  );
});

test("the renderer hears live progress and can snapshot mid-download", () => {
  assert.ok(code.includes('send("update:progress"'), "main pushes update:progress");
  assert.ok(preloadSrc.includes("update:progress"), "preload bridges update:progress");
  assert.ok(preloadSrc.includes('"update:status"'), "preload exposes the status snapshot");
  assert.ok(code.includes('handle("update:status"'), "main serves the status snapshot");
});

test("the banner shows downloading progress and restart-to-apply", () => {
  assert.ok(
    bannerSrc.includes("useDesktopUpdateStatus"),
    "banner reads the live desktop status"
  );
  assert.ok(/Downloading update…/.test(bannerSrc), "downloading state shows progress");
  assert.ok(/Restart now/.test(bannerSrc), "ready state offers Restart now");
});
