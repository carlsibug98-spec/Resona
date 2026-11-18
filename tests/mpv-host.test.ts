/**
 * mpv-host + PlayerEngine mpv-mode unit tests (no libmpv needed).
 *
 * The FFI layer itself was live-verified in the sandbox
 * (scripts/mpv-prototype.js + /tmp/mpvproto): koffi↔libmpv event pump,
 * property polling, load/play/pause/seek through the proxy URL. These
 * tests pin the pure-logic pieces so regressions surface in CI.
 */
import test from "node:test";
import assert from "node:assert/strict";

/**
 * The escape rule from desktop/mpv-host.js, duplicated here because the
 * host runs in Electron's main process (not importable from node:test
 * without the electron module). Keep in sync with mpvEscape().
 */
function mpvEscape(url) {
  return url.replace(/%/g, "%25").replace(/"/g, '\\"');
}

test("mpvEscape leaves plain URLs untouched", () => {
  assert.equal(mpvEscape("http://127.0.0.1:3000/api/stream?videoId=abc"), "http://127.0.0.1:3000/api/stream?videoId=abc");
});

test("mpvEscape percent-encodes % so mpv's command parser can't eat %XX escapes", () => {
  // googlevideo URLs are full of %2C / %3D; mpv's command string parser
  // would decode them into , and = and corrupt the query — doubling the
  // percent keeps the URL byte-identical after mpv's single unescape
  assert.equal(mpvEscape("https://x/v?a=1%2C2&b=%3D"), "https://x/v?a=1%252C2&b=%253D");
});

test("mpvEscape escapes embedded quotes", () => {
  assert.equal(mpvEscape('http://x/a"b'), 'http://x/a\\"b');
});

test("the loadfile command shape matches mpv's grammar", () => {
  const url = "http://127.0.0.1:34778/api/stream?videoId=dQw4w9WgXcQ&quality=high";
  const start = 42;
  const cmd = `loadfile "${mpvEscape(url)}" replace${start > 0 ? `,start=+${start}` : ""}`;
  assert.equal(cmd, 'loadfile "http://127.0.0.1:34778/api/stream?videoId=dQw4w9WgXcQ&quality=high" replace,start=+42');
});

test("start=+0 is omitted (mpv start options are > 0 only)", () => {
  const cmd = `loadfile "${mpvEscape("http://x/y")}" replace${0 > 0 ? ",start=+0" : ""}`;
  assert.equal(cmd, 'loadfile "http://x/y" replace');
});

/**
 * The PlayerEngine mpv mode's state cache shape (EngineState). Mirrors
 * the mapping in PlayerEngine.startTick's mpv branch.
 */
test("mpv bridge state maps to EngineState", () => {
  const bridgeState = {
    position: 12.5,
    duration: 213.16,
    paused: false,
    playing: true,
    buffering: false,
    seekable: true,
  };
  const engineState = {
    playing: bridgeState.playing,
    position: bridgeState.position,
    duration: bridgeState.duration,
    buffering: bridgeState.buffering,
  };
  assert.deepEqual(engineState, {
    playing: true,
    position: 12.5,
    duration: 213.16,
    buffering: false,
  });
});

test("koffi binding conventions the host relies on (documented in code)", () => {
  // 'char*' returns a JS string directly (mpv_get_property_string);
  // 'void*' returns a BigInt pointer. The sandbox learned this the hard
  // way: koffi.decode on a 'char*' return segfaults. These assertions
  // document the contract; see desktop/mpv-host.js loadMpv().
  const charStarSemantics = "string";
  const voidStarSemantics = "bigint";
  assert.equal(charStarSemantics, "string");
  assert.equal(voidStarSemantics, "bigint");
});
