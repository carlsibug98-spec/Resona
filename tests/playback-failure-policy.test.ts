import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * v1.7.6 — Musify failure policy regression guard (supersedes the v1.7.3
 * "no-auto-advance" rule): a failing track auto-skips to the next song
 * after 2 s (Musify `_handlePlaybackError` parity); playback stops with
 * the manual Retry banner only after 3 consecutive failed TRACKS; a
 * track that starts playing cancels the pending skip and resets the
 * counter. The wiring lives in PlayerProvider.tsx (a React component,
 * not renderable under node:test), so this asserts the source.
 *
 * The start watchdogs in player-engine.ts carry the other half of the
 * policy: a source that is downloading but slow is never killed early —
 * those assertions pin the no-data windows and hard caps.
 */

const providerDir = dirname(fileURLToPath(import.meta.url));

const src = readFileSync(join(providerDir, "../src/components/player/PlayerProvider.tsx"), "utf8");
const engineSrc = readFileSync(join(providerDir, "../src/lib/player-engine.ts"), "utf8");

/** strip // and /* *\/ comments so mentions in prose don't false-positive */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function handlerBody(anchor: string): string {
  const re = new RegExp(`${anchor} = \\(msg\\) => \\{([\\s\\S]*?)\\n    \\};`);
  const m = code.match(re);
  assert.ok(m, `expected an ${anchor} handler in PlayerProvider.tsx`);
  return m[1];
}

test("failing tracks auto-skip: both failure handlers schedule the 2s advance", () => {
  for (const anchor of ["engine.onError", "engine.onLoadFailed"]) {
    const body = handlerBody(anchor);
    assert.ok(/scheduleSkip\(/.test(body), `${anchor} must schedule an auto-skip below the cap`);
  }
  assert.ok(/ERROR_SKIP_DELAY_MS = 2_000/.test(code), "skip delay must stay 2 s (Musify parity)");
});

test("playback stops with a banner only after 3 consecutive failed tracks", () => {
  assert.ok(/MAX_CONSECUTIVE_FAILURES = 3/.test(code), "cap must be 3 (Musify parity)");
  for (const anchor of ["engine.onError", "engine.onLoadFailed"]) {
    const body = handlerBody(anchor);
    assert.ok(/MAX_CONSECUTIVE_FAILURES/.test(body), `${anchor} must check the cap`);
    assert.ok(/usePlaybackError\.getState\(\)\.show/.test(body), `${anchor} must banner at the cap`);
  }
});

test("a track that starts playing cancels the pending skip and resets the counter", () => {
  const onState = code.match(/engine\.onState = \(s\) => \{([\s\S]*?)\n    \};/);
  assert.ok(onState, "expected an onState handler");
  assert.ok(/cancelPendingSkip\(\)/.test(onState[1]), "onState(playing) must cancel the pending skip");
  assert.ok(/consecutiveErrors = 0/.test(onState[1]), "onState(playing) must reset the counter");
});

test("the delayed skip only fires while still on the failed track", () => {
  const sched = code.match(/const scheduleSkip = [\s\S]*?\n    \};/);
  assert.ok(sched, "expected scheduleSkip helper");
  assert.ok(/p\.current\(\)\?\.videoId !== failedVideoId/.test(sched[0]), "same-song guard required");
  assert.ok(/p\.next\(\)/.test(sched[0]), "skip must advance via p.next()");
  assert.ok(/usePlaybackError\.getState\(\)\.show/.test(sched[0]), "queue end must banner (nothing to skip to)");
});

test("failure handlers advance only through the guarded scheduleSkip", () => {
  for (const anchor of ["engine.onError", "engine.onLoadFailed"]) {
    const body = handlerBody(anchor);
    assert.ok(!/\.next\(/.test(body), `${anchor} must not call p.next() directly`);
  }
});

test("failed tracks are counted once — distinct tracks, not error events", () => {
  const note = code.match(/const noteError = [\s\S]*?\n    \};/);
  assert.ok(note, "expected noteError helper");
  assert.ok(!/else\s*\{/.test(note[0]), "same-track re-errors must not increment (one dead song ≠ 3)");
});

test("start watchdogs are patient: no-data windows and hard caps (engine)", () => {
  assert.ok(/armStartWatchdog\(a, 15_000, 45_000, onFail\)/.test(engineSrc), "proxy: 15s no-data / 45s cap");
  assert.ok(/armStartWatchdog\(a, 12_000, 30_000, onFail\)/.test(engineSrc), "direct: 12s no-data / 30s cap");
  assert.ok(!/armProbeTimer\(8_000/.test(engineSrc), "the v1.7.5 fixed 8s kill must stay deleted");
  assert.ok(!/armProbeTimer\(15_000/.test(engineSrc), "the v1.7.5 fixed 15s kill must stay deleted");
});

test("the watchdog grants the full budget once media data has arrived", () => {
  const wd = engineSrc.match(/private armStartWatchdog\([\s\S]*?\n  \}/);
  assert.ok(wd, "expected armStartWatchdog helper");
  assert.ok(/buffered\.length > 0/.test(wd[0]), "progress check required");
  assert.ok(/hardCapMs - noDataMs/.test(wd[0]), "remaining-budget arithmetic required");
});
