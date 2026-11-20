/**
 * mpv-host — the Musify playback core inside Resona.
 *
 * v1.7.7: Resona's engine internals are Musify's (ported in v1.7.6 — client
 * ladder, quality tiers, failure policy), but audio still came out of an
 * HTMLAudioElement, subject to browser codec quirks, autoplay policies and
 * media-pipeline stalls. Musify itself plays through libmpv (media_kit):
 * its own demuxer, decoder and network stack — the reason it plays
 * everything effortlessly.
 *
 * This host is that core: libmpv driven over koffi (the same FFI media_kit
 * uses on Windows, libmpv-2.dll), exposed to the renderer over IPC.
 *
 * URL policy (sandbox-verified 2026-11-18, see scripts/mpv-prototype.js):
 * - DIRECT googlevideo URLs 403 when mpv's ffmpeg opens them: mpv's ffmpeg
 *   sends a no-Range GET that googlevideo answers with a 302 to a node that
 *   then rejects the redirected request. (Node fetch/undici and curl both
 *   sail through; only mpv's lavf trips this.)
 * - The same-origin byte proxy (/api/stream?videoId=…) works PERFECTLY:
 *   the server fetches googlevideo with the minted UA (undici), mpv talks
 *   to localhost with no auth constraints. Verified: decoded playback,
 *   correct duration, seek, pause.
 * So: mpv ALWAYS plays the proxy URL. HTML5 direct remains the fast path
 * in player-engine.ts, with mpv as the robust engine when the browser
 * element can't cut it.
 *
 * Downloaded copies stay on the HTML5 element (local blob URLs, no network
 * to survive) — routing 150 MB blobs over IPC buys nothing.
 */
const { ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// koffi is loaded lazily: a missing/broken libmpv must never take the app
// down — the engine falls back to HTML5 (see player-engine.ts).
let koffi = null;
let lib = null;
let F = null;
let MpvEvent = null;
let MpvEventEndFile = null;
let loadError = null;

// mpv client-api event ids we care about (client.h)
const EV_END_FILE = 7;
const EV_FILE_LOADED = 8;
const EV_IDLE = 11;

// mpv_end_file_reason (client.h, since API 1.9): the renderer MUST see the
// reason — an end-file(reason=error) is a dead stream, an end-file(reason=eof)
// is end-of-song. Collapsing both into one signal made v1.7.7 auto-advance the
// queue on every failed load.
const MPV_END_FILE_REASON_EOF = 0;
const MPV_END_FILE_REASON_STOP = 2;
const MPV_END_FILE_REASON_QUIT = 3;
const MPV_END_FILE_REASON_ERROR = 4;
const MPV_END_FILE_REASON_REDIRECT = 5;
const REASON_NAMES = {
  [MPV_END_FILE_REASON_EOF]: "eof",
  [MPV_END_FILE_REASON_STOP]: "stop",
  [MPV_END_FILE_REASON_QUIT]: "quit",
  [MPV_END_FILE_REASON_ERROR]: "error",
  [MPV_END_FILE_REASON_REDIRECT]: "redirect",
};

function loadMpv() {
  if (lib) return true;
  if (loadError) return false;
  try {
    koffi = require("koffi");
    // libmpv-2.dll ships next to the app (extraResources); in dev, musify's
    const candidates =
      process.platform === "win32"
        ? [
            path.join(process.resourcesPath || "", "libmpv-2.dll"),
            path.join(__dirname, "libmpv-2.dll"),
          ]
        : [
            process.env.RESONA_MPV_LIB, // dev/testing override
            "libmpv.so.2",
          ];
    let dll = null;
    for (const c of candidates) {
      if (!c) continue;
      if (c.includes(path.sep) && !fs.existsSync(c)) continue;
      try {
        dll = koffi.load(c);
        break;
      } catch {
        /* try next */
      }
    }
    if (!dll) throw new Error("libmpv not found");

    lib = dll;
    // koffi semantics (sandbox-proven): 'char*' returns a JS string
    // directly; 'void*' returns a BigInt pointer. Never koffi.decode a
    // string return — that segfaults.
    F = {
      create: lib.func("void* mpv_create()"),
      init: lib.func("int mpv_initialize(void*)"),
      destroy: lib.func("void mpv_terminate_destroy(void*)"),
      setopt: lib.func("int mpv_set_option_string(void*, const char*, const char*)"),
      cmdstr: lib.func("int mpv_command_string(void*, const char*)"),
      getprop: lib.func("char* mpv_get_property_string(void*, const char*)"),
      setprop: lib.func("int mpv_set_property_string(void*, const char*, const char*)"),
      waitev: lib.func("void* mpv_wait_event(void*, double)"),
    };
    MpvEvent = koffi.struct("MpvEvent", {
      event_id: "uint32",
      error: "int",
      reply_userdata: "uint64",
      data: "void*",
    });
    // mpv_event_end_file { mpv_end_file_reason reason; int error; } — two
    // int32s, no padding surprises. Decoded from the event's data pointer.
    MpvEventEndFile = koffi.struct("MpvEventEndFile", {
      reason: "int32",
      error: "int32",
    });
    return true;
  } catch (e) {
    loadError = e.message;
    console.warn("[mpv-host] libmpv unavailable:", e.message);
    return false;
  }
}

/** the single mpv instance + its event pump */
let ctx = null;
let eventTimer = null;
let win = null; // BrowserWindow to forward state to

function ok(code, what) {
  if (code < 0) throw new Error(`mpv ${what} failed (${code})`);
}

function send(channel, payload) {
  try {
    win?.webContents?.send(channel, payload);
  } catch {
    /* window closing */
  }
}

function getStr(name) {
  const s = F.getprop(ctx, name);
  return s === null || s === undefined ? null : s;
}

function pumpEvents() {
  if (!ctx) return;
  try {
    // drain the queue: wait_event(0) never blocks
    for (let i = 0; i < 50; i++) {
      const ev = koffi.decode(F.waitev(ctx, 0), 0, MpvEvent);
      if (ev.event_id === 0) break;
      if (ev.event_id === EV_FILE_LOADED) {
        send("mpv:file-loaded", {});
      } else if (ev.event_id === EV_END_FILE) {
        // decode the end-file reason from the event's data pointer; a decode
        // hiccup must NOT kill the pump (it used to be one try around the
        // whole drain — one bad event silenced every event after it)
        let reason = -1;
        let error = 0;
        try {
          if (ev.data) {
            const ef = koffi.decode(ev.data, 0, MpvEventEndFile);
            reason = typeof ef?.reason === "number" ? ef.reason : -1;
            error = typeof ef?.error === "number" ? ef.error : 0;
          }
        } catch {
          /* keep unknown reason — the renderer treats -1 conservatively */
        }
        send("mpv:end-file", { reason, error, reasonName: REASON_NAMES[reason] || "unknown" });
      } else if (ev.event_id === EV_IDLE) {
        send("mpv:idle", {});
      }
    }
  } catch {
    /* instance died — the renderer falls back */
  }
}

function ensureCtx() {
  if (ctx) return ctx;
  if (!loadMpv()) throw new Error(loadError || "libmpv unavailable");
  ctx = F.create();
  if (!ctx) throw new Error("mpv_create failed");
  // audio-only app: no video output, no window, keep the process idle
  // between tracks so instant replays work (Musify keeps one player too)
  ok(F.setopt(ctx, "ao", process.env.RESONA_MPV_AO || "wasapi")), "ao";
  ok(F.setopt(ctx, "vo", "null"), "vo");
  ok(F.setopt(ctx, "idle", "yes"), "idle");
  ok(F.setopt(ctx, "force-window", "no"), "force-window");
  ok(F.setopt(ctx, "keep-open", "always"), "keep-open"); // pause at EOF; we advance the queue ourselves
  ok(F.setopt(ctx, "network-timeout", "15"), "network-timeout");
  ok(F.init(ctx), "initialize");
  // poll the event queue at 250 ms — state is pulled by the renderer at
  // its own cadence (400 ms, same as the HTML5 tick)
  eventTimer = setInterval(pumpEvents, 250);
  return ctx;
}

/** escape for mpv's command-string parser: % starts an escape sequence */
function mpvEscape(url) {
  return url.replace(/%/g, "%25").replace(/"/g, '\\"');
}

function registerIpc() {
  ipcMain.handle("mpv:available", () => {
    try {
      // honest check: libmpv loaded (the `&& !!ensureCtx` this replaces was
      // always true — a function reference — and told the renderer nothing)
      return loadMpv();
    } catch {
      return false;
    }
  });

  ipcMain.handle("mpv:load", (_e, { url, startSec }) => {
    ensureCtx();
    const start = Math.max(0, Math.floor(startSec || 0));
    const opt = start > 0 ? `,start=+${start}` : "";
    ok(
      F.cmdstr(ctx, `loadfile "${mpvEscape(url)}" replace${opt}`),
      "loadfile"
    );
    return true;
  });

  ipcMain.handle("mpv:play", () => {
    ensureCtx();
    ok(F.setprop(ctx, "pause", "no"), "pause=no");
    return true;
  });

  ipcMain.handle("mpv:pause", () => {
    ensureCtx();
    ok(F.setprop(ctx, "pause", "yes"), "pause=yes");
    return true;
  });

  ipcMain.handle("mpv:seek", (_e, sec) => {
    ensureCtx();
    ok(F.cmdstr(ctx, `seek ${Math.max(0, Number(sec) || 0)} absolute`), "seek");
    return true;
  });

  ipcMain.handle("mpv:volume", (_e, volPct) => {
    ensureCtx();
    // mpv volume is 0-100 linear; HTML5 is 0-1 logarithmic — the renderer
    // sends its 0-100 rounded value, matching what applyVolume does today
    ok(F.setprop(ctx, "volume", String(Math.round(volPct))), "volume");
    return true;
  });

  ipcMain.handle("mpv:stop", () => {
    if (!ctx) return true;
    try {
      F.cmdstr(ctx, "stop");
    } catch {
      /* noop */
    }
    return true;
  });

  ipcMain.handle("mpv:state", () => {
    if (!ctx) return null;
    const pos = getStr("time-pos");
    const dur = getStr("duration");
    const paused = getStr("pause");
    const buffering = getStr("paused-for-cache");
    const seekable = getStr("seekable");
    // eof-reached is the ONLY end-of-song signal this app gets: with
    // keep-open=always mpv never unloads the file at EOF and therefore never
    // sends end-file(reason=eof) — mpv playloop handle_keep_open flips
    // stop_play to KEEP_PLAYING before end_current_file ever runs. Without
    // surfacing this, the queue sat in silence at every natural track end.
    const eofReached = getStr("eof-reached");
    const idleActive = getStr("idle-active");
    return {
      position: pos !== null ? parseFloat(pos) : 0,
      duration: dur !== null ? parseFloat(dur) : 0,
      paused: paused === "yes",
      playing: paused === "no" && pos !== null,
      buffering: buffering === "yes",
      seekable: seekable === "yes",
      eofReached: eofReached === "yes",
      idleActive: idleActive === "yes",
    };
  });

  ipcMain.handle("mpv:shutdown", () => {
    if (eventTimer) {
      clearInterval(eventTimer);
      eventTimer = null;
    }
    if (ctx) {
      try {
        F.destroy(ctx);
      } catch {
        /* noop */
      }
      ctx = null;
    }
    return true;
  });
}

/** called from main.js with the window so state events can be forwarded */
exports.attach = (browserWindow) => {
  win = browserWindow;
};

exports.registerIpc = registerIpc;
