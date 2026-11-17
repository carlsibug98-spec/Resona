import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * v1.7.3 regression guard: a track that fails to start must STAY on
 * screen — the queue never advances on its own after onError /
 * onLoadFailed. The wiring lives in PlayerProvider.tsx (a React
 * component, not renderable under node:test), so this asserts the
 * source: no scheduled advance, no p.next() inside the failure
 * handlers. Manual next/skip via the UI and the onEnded advance are of
 * course untouched — only failure-triggered auto-advance is banned.
 */

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/components/player/PlayerProvider.tsx"),
  "utf8"
);

/** strip // and /* *\/ comments so mentions in prose don't false-positive */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function handlerBody(anchor: string): string {
  const re = new RegExp(`${anchor} = \\(msg\\) => \\{([\\s\\S]*?)\\n    \\};`);
  const m = code.match(re);
  assert.ok(m, `expected an ${anchor} handler in PlayerProvider.tsx`);
  return m[1];
}

test("onError does not advance the queue", () => {
  const body = handlerBody("engine.onError");
  assert.ok(!/\.next\(/.test(body), "onError must not call p.next()");
  assert.ok(!/setTimeout/.test(body), "onError must not schedule an advance");
});

test("onLoadFailed does not advance the queue", () => {
  const body = handlerBody("engine.onLoadFailed");
  assert.ok(!/\.next\(/.test(body), "onLoadFailed must not call p.next()");
  assert.ok(!/setTimeout/.test(body), "onLoadFailed must not schedule an advance");
});

test("no scheduleAdvance helper remains anywhere in the provider", () => {
  assert.ok(!code.includes("scheduleAdvance"), "auto-advance machinery must stay deleted");
});

test("failure handlers still surface the error banner (manual retry stays possible)", () => {
  assert.ok(/engine\.onError[\s\S]*?usePlaybackError\.getState\(\)\.show/.test(code));
  assert.ok(/engine\.onLoadFailed[\s\S]*?usePlaybackError\.getState\(\)\.show/.test(code));
});
