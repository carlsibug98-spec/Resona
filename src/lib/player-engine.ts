"use client";

import type { Track } from "@/lib/types";
import { idbGetAudio } from "@/lib/idb";
import { useSettings } from "@/stores/settings";

/**
 * Build a /api/stream URL that carries the user's Audio-quality setting
 * (Musify's audioQualitySetting → every stream request): ?quality=high
 * picks the top bitrate tier, standard the lower one. Reading the store
 * lazily per call means switching the setting applies to the NEXT track
 * without a player restart.
 */
function streamUrl(videoId: string, resolve = false): string {
  const q = new URLSearchParams({
    videoId,
    ...(resolve ? { resolve: "1" } : {}),
  });
  if (useSettings.getState().audioQuality === "high") q.set("quality", "high");
  return `/api/stream?${q.toString()}`;
}

 

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * The mpv core (desktop only): window.resonaDesktop.mpv when libmpv is
 * bundled (v1.7.7+). Playing through mpv is the Musify architecture — its
 * own demuxer/decoder/network stack instead of the browser media pipeline.
 * Verified in-sandbox: mpv plays the same-origin proxy stream reliably
 * where the browser element sometimes can't.
 */
interface MpvBridge {
  available(): Promise<boolean>;
  load(url: string, startSec: number): Promise<boolean>;
  play(): Promise<boolean>;
  pause(): Promise<boolean>;
  seek(sec: number): Promise<boolean>;
  volume(v: number): Promise<boolean>;
  stop(): Promise<boolean>;
  state(): Promise<{
    position: number;
    duration: number;
    paused: boolean;
    playing: boolean;
    buffering: boolean;
    seekable: boolean;
    /** mpv paused at end-of-file (keep-open=always) — the ONLY end-of-song
     *  signal that fires, because keep-open suppresses end-file(reason=eof) */
    eofReached?: boolean;
    /** mpv is idle (no file loaded) — while a load is pending this means the
     *  open failed and the engine should fall through to the HTML5 ladder */
    idleActive?: boolean;
  } | null>;
  shutdown(): Promise<boolean>;
  onFileLoaded(cb: () => void): () => void;
  /** cb receives { reason, error, reasonName } — mpv_end_file_reason from
   *  client.h: 0 eof · 2 stop · 3 quit · 4 error · 5 redirect (−1 unknown) */
  onEndFile(cb: (info: { reason: number; error: number; reasonName?: string }) => void): () => void;
  /** mpv entered idle mode (fast "open failed" signal during a pending load) */
  onIdle(cb: () => void): () => void;
}

function mpvBridge(): MpvBridge | null {
  if (typeof window === "undefined") return null;
  const d = (window as any).resonaDesktop;
  return d?.mpv ?? null;
}

export interface EngineState {
  playing: boolean;
  position: number;
  duration: number;
  buffering: boolean;
}

/** mpv's state plus the EOF/idle flags the engine's queue decisions need */
type MpvState = EngineState & { eofReached: boolean; idleActive: boolean };

/** mpv_end_file_reason (mpv client.h) */
const MPV_END_FILE_EOF = 0;
const MPV_END_FILE_ERROR = 4;

type Listener = (s: EngineState) => void;

let ytPromise: Promise<void> | null = null;

/**
 * Videos the YouTube embed refused (error 100/101/150: removed, private,
 * embedding disabled). If the embed rejected a video once, re-trying it
 * goes: iframe → instant 150 → (retry guard) → full audio chain → iframe
 * → 150 → banner — the user waits ~30 s to learn the same thing. With
 * the memory, a known-dead video fails fast with the real reason.
 */
const ytDeadEmbeds = new Map<string, number>();
const YT_DEAD_TTL = 1000 * 60 * 10;

function isYtEmbedDead(videoId: string): boolean {
  const until = ytDeadEmbeds.get(videoId);
  if (!until) return false;
  if (Date.now() > until) {
    ytDeadEmbeds.delete(videoId);
    return false;
  }
  return true;
}

function loadYT(): Promise<void> {
  if (ytPromise) return ytPromise;
  ytPromise = new Promise<void>((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    // if the script is blocked (offline, firewall), the old promise never
    // settled and playback hung silently forever — fail after 10 s so the
    // error path can surface instead
    const timer = setTimeout(() => {
      if (window.YT?.Player) return resolve();
      s.remove();
      reject(new Error("youtube iframe api failed to load"));
    }, 10_000);
    s.addEventListener("load", () => clearTimeout(timer), { once: true });
    s.addEventListener("error", () => {
      clearTimeout(timer);
      s.remove();
      reject(new Error("youtube iframe api failed to load"));
    }, { once: true });
    document.head.appendChild(s);
  });
  // a failed load must not cache a rejected promise forever
  ytPromise.catch(() => {
    ytPromise = null;
  });
  return ytPromise;
}

export class PlayerEngine {
  private yt: any = null;
  private audio: HTMLAudioElement | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private hostEl: HTMLElement | null = null;
  private probing = false;
  /** the mpv core (v1.7.7): set when the desktop bridge + libmpv are both
   *  present. mpv IS the current engine; HTML5 remains for local blobs and
   *  as the automatic fallback when mpv is missing or a load fails. */
  private mpv: MpvBridge | null = null;
  private mpvReady = false;
  private usingMpv = false;
  private mpvLoadedVideoId: string | null = null;
  /** the track mpv is still OPENING (tryMpv → waitForMpvLoad window). While
   *  set, end-file/idle events mean "the open failed", never "song finished".
   *  v1.7.7 conflated the two and auto-advanced the queue on every failed
   *  load — the heart of the "always reload and stop" report. */
  private mpvPendingVideoId: string | null = null;
  /** latched by an idle or end-file(error) event while a load is pending */
  private mpvLoadFailed = false;
  /** true only while the ENGINE itself commands mpv to stop, so the
   *  end-file(reason=stop) that command triggers cannot advance the queue */
  private mpvStopping = false;
  /** one-shot per loaded track: fires onEnded exactly once at end-of-song
   *  (from the eof-reached watcher, or end-file(eof) on hosts without
   *  keep-open). Without the latch the 400 ms tick would re-fire onEnded
   *  every poll while mpv sits at EOF. */
  private mpvEofFired = false;
  /** the volume mpv must start each new track with — mpv boots at 100 and
   *  v1.7.7 never applied the user's setting on the mpv path */
  private lastVolumePct = 90;
  /** generation counter for load(): a newer load must silence every pending
   *  await of an older one (rapid skips used to let the stale ladder finish
   *  AFTER the new load and overwrite the engine's track/state — the queue
   *  showed one song while the engine played another) */
  private loadGen = 0;
  private mpvStateCache: MpvState | null = null;
  /**
   * When a probe's src was last torn down (pause/removeAttribute/load).
   * The <audio> element emits its "error" event asynchronously AFTER the
   * probe already settled and cleared `probing` — without this timestamp
   * those probe failures counted as real playback errors (4+ per failed
   * track), which tripped the "too many errors" stop before auto-advance
   * ever ran: the queue stuck on the failed song. v1.7.1.
   */
  private lastProbeTeardown = 0;

  /** probe bookkeeping: a generation counter + active timers, so a stale
   * attempt's timeout can never settle a newer attempt (rapid track
   * changes used to leave 8/15s timers armed over a fresh probe) */
  private probeGen = 0;
  private probeTimers: ReturnType<typeof setTimeout>[] = [];

  private armProbeTimer(ms: number, fn: () => void): void {
    const gen = this.probeGen;
    const t = setTimeout(() => {
      // only fire if no newer probe started since this one was armed
      if (gen === this.probeGen) fn();
      this.probeTimers = this.probeTimers.filter((x) => x !== t);
    }, ms);
    this.probeTimers.push(t);
  }

  private clearProbes(): void {
    this.probeGen++;
    for (const t of this.probeTimers) clearTimeout(t);
    this.probeTimers = [];
    this.probing = false;
  }

  /**
   * Musify-style patient start watchdog. A source is only declared dead
   * when NO media data has arrived within `noDataMs`; a source that is
   * downloading (buffered bytes exist) but slow to first frame keeps its
   * full `hardCapMs` budget instead of being killed. The fixed 8 s / 15 s
   * cutoffs this replaces turned "slow start" into "failed track": on a
   * throttled network the first bytes legitimately take longer, and
   * killing the source pushed the same slow stream through the fallback
   * ladder until everything failed. Musify has no start deadline at all —
   * the caps here exist so a truly dead source still reaches the embed
   * fallback and a visible banner. `onFail` is the caller's settled-
   * guarded callback, so late firing after a successful start is a no-op.
   */
  private armStartWatchdog(
    a: HTMLAudioElement,
    noDataMs: number,
    hardCapMs: number,
    onFail: () => void,
  ): void {
    this.armProbeTimer(noDataMs, () => {
      if (a.buffered.length > 0) {
        const rest = Math.max(0, hardCapMs - noDataMs);
        if (rest > 0) this.armProbeTimer(rest, onFail);
        else onFail();
      } else {
        onFail();
      }
    });
  }

  /** tear down the audio element src after a failed probe; the async
   * error event it triggers must be attributed to the probe, not real
   * playback (see lastProbeTeardown) */
  private killAudioSrc(): void {
    const a = this.audio;
    if (!a) return;
    this.lastProbeTeardown = Date.now();
    a.pause();
    a.removeAttribute("src");
    a.load();
  }

  currentVideoId: string | null = null;
  currentIsAudio = false;
  private currentTrack: Track | null = null;
  /** the videoId the last iframe→audio retry was used for; one retry per
   *  track — load() must NOT reset this (the retry path calls load() again,
   *  and resetting here made the retry loop infinite: v1.6.9 bug) */
  private iframeRetriedFor: string | null = null;

  onState: Listener = () => {};
  onEnded: () => void = () => {};
  onError: (msg: string) => void = () => {};
  /**
   * load() itself could not start ANY source for the track (all audio
   * providers dead + embed dead/unstartable). Distinct from onError:
   * this always means the track is unplayable right now — the UI should
   * banner it and move the queue on.
   */
  onLoadFailed: (msg: string) => void = () => {};

  /** the track after the current one — warmed ahead of the gapless switch */
  private nextVideoId: string | null = null;

  /** the queue successor's videoId (warmed via warmNext) */
  setNextTrack(videoId: string | null) {
    this.nextVideoId = videoId;
  }

  /**
   * Resolve the next track's stream URL while the current one plays, so
   * the queue gap disappears: by the time a song ends its successor's
   * resolution is already in the server cache and the next load() finds
   * it instantly.
   */
  private warmNext() {
    if (!this.nextVideoId || this.nextVideoId === this.currentVideoId) return;
    const id = this.nextVideoId;
    fetch(streamUrl(id, true), {
      cache: "no-store",
    }).catch(() => {
      /* best-effort warmth */
    });
  }

  attachHost(el: HTMLElement | null) {
    this.hostEl = el;
    this.initMpv();
  }

  /**
   * Bind the mpv core once. Failures are permanent-but-quiet: the HTML5
   * chain serves everything as before, exactly like pre-v1.7.7.
   */
  private initMpv(): void {
    if (this.mpv !== null || this.mpvReady) return;
    const bridge = mpvBridge();
    if (!bridge) return; // web build, or desktop without libmpv
    bridge
      .available()
      .then((ok) => {
        if (!ok) return;
        this.mpv = bridge;
        this.mpvReady = true;
        // end-of-file → advance the queue. With keep-open=always mpv NEVER
        // sends this at a natural end-of-song (playloop handle_keep_open
        // keeps the file loaded) — the eof-reached watcher in startTick is
        // the primary advance signal; end-file(eof) only fires on hosts
        // where keep-open is off.
        bridge.onEndFile((info) => this.onMpvEndFile(info));
        bridge.onIdle(() => this.onMpvIdle());
        bridge.onFileLoaded(() => {
          // the file is demuxed and ready — count it as playing data for
          // the diagnostics surface
          if (this.usingMpv) this.onState(this.getState());
        });
      })
      .catch(() => {
        /* bridge broken — HTML5 fallback, permanently for this session */
      });
  }

  /** mpv went idle: between tracks that is normal (idle=yes), but while an
   *  open is pending it means the URL failed — fail the wait fast instead of
   *  burning its full 12 s budget (v1.7.7 paid that dead air on EVERY track,
   *  because the renderer handed mpv a relative URL it could only try to
   *  open as a local file path). */
  private onMpvIdle(): void {
    if (this.mpvPendingVideoId) this.mpvLoadFailed = true;
  }

  /**
   * end-file with the reason attached. The three cases are OPPOSITE queue
   * decisions and must never be conflated:
   *  - pending load + end-file(error)  → the open failed: fall to HTML5
   *  - playing track + end-file(error) → the stream died mid-song: a real
   *    playback ERROR through the Musify failure policy (count + auto-skip),
   *    NOT a silent queue advance
   *  - end-file(eof)                   → end-of-song: advance the queue
   *  - end-file(stop/quit)             → our own stop/shutdown: ignore
   */
  private onMpvEndFile(info: { reason: number; error: number; reasonName?: string }): void {
    if (this.mpvPendingVideoId) {
      // the file never finished opening: any end-file now is a failure
      this.mpvLoadFailed = true;
      return;
    }
    if (!this.usingMpv) return;
    if (info.reason === MPV_END_FILE_ERROR) {
      this.usingMpv = false;
      this.mpvLoadedVideoId = null;
      this.onError(`mpv stream error (${info.reasonName || "error"})`);
      return;
    }
    if (this.mpvStopping) return; // our own stop command
    if (info.reason === MPV_END_FILE_EOF && !this.mpvEofFired) {
      this.mpvEofFired = true;
      this.onEnded();
    }
  }

  /**
   * Play a network track through the mpv core via the same-origin byte
   * proxy (sandbox-verified path: mpv's ffmpeg 403s direct googlevideo
   * URLs, but plays the proxied stream perfectly). Resolves false if mpv
   * can't take the track so load() falls through to the HTML5 ladder.
   */
  private async tryMpv(videoId: string, startSec: number): Promise<boolean> {
    if (!this.mpv || !this.mpvReady) return false;
    const gen = this.loadGen;
    try {
      // mpv lives in the Electron MAIN process: a renderer-relative URL like
      // /api/stream?videoId=… is, to it, a LOCAL FILE PATH. v1.7.7 shipped
      // exactly that — mpv failed every open, waitForMpvLoad burned its full
      // 12 s on every track, and only then did the HTML5 ladder start. The
      // window is loaded from http://127.0.0.1:<port> (the Next server), so
      // absolutizing against window.location.origin is always correct here.
      const rel = streamUrl(videoId); // the byte proxy, quality param rides along
      const url = /^https?:\/\//i.test(rel)
        ? rel
        : new URL(rel, window.location.origin).toString();
      this.mpvLoadFailed = false;
      this.mpvPendingVideoId = videoId;
      this.mpvLoadedVideoId = videoId;
      this.usingMpv = true; // state plumbing during the wait; end-file gating treats pending separately
      await this.mpv.load(url, startSec);
      if (gen !== this.loadGen) return false; // a newer load owns the engine now
      // wait (bounded) for the file to actually load — a URL mpv can't open
      // now fails FAST (idle / end-file(error) events latch mpvLoadFailed)
      // instead of always paying the full deadline
      const loaded = await this.waitForMpvLoad(videoId);
      if (gen !== this.loadGen) return false;
      if (!loaded) {
        if (gen === this.loadGen) await this.mpvStop();
        return false;
      }
      this.mpvPendingVideoId = null;
      this.mpvEofFired = false;
      this.mpvStateCache = {
        playing: false,
        position: startSec,
        duration: 0,
        buffering: true,
        eofReached: false,
        idleActive: false,
      };
      // mpv boots at volume 100 — apply the user's setting NOW, not only on
      // the next slider move (v1.7.7 played every mpv track at full blast)
      void this.mpv.volume(this.lastVolumePct).catch(() => {});
      return true;
    } catch {
      if (gen === this.loadGen) {
        this.usingMpv = false;
        this.mpvLoadedVideoId = null;
        this.mpvPendingVideoId = null;
      }
      return false;
    }
  }

  /**
   * Bounded wait for mpv's state to report a loaded file (duration > 0).
   * The host's file-loaded event fires on demux-open; polling state is the
   * belt-and-braces path — and the idle / end-file(error) listeners latch
   * mpvLoadFailed so a dead URL fails within milliseconds of mpv noticing.
   */
  private async waitForMpvLoad(videoId: string): Promise<boolean> {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (this.mpvLoadedVideoId !== videoId) return false; // superseded
      if (this.mpvLoadFailed) return false; // open failed — fall through fast
      const s = await this.mpv!.state().catch(() => null);
      if (s && s.duration > 0) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  private async mpvStop(): Promise<void> {
    // mark our own stop so the end-file(reason=stop) mpv emits for this
    // command can never be read as end-of-song (mpvStopping guard)
    this.mpvStopping = true;
    this.usingMpv = false;
    this.mpvLoadedVideoId = null;
    this.mpvPendingVideoId = null;
    await this.mpv?.stop().catch(() => {});
    this.mpvStopping = false;
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
      this.audio.addEventListener("ended", () => this.onEnded());
      this.audio.addEventListener("error", () => {
        // while probing a candidate stream we swallow errors and treat
        // them as "this source didn't work" instead of a playback failure;
        // the same goes for the async error fired moments AFTER a failed
        // probe tore the src down (probing is already false again) —
        // without the timestamp guard those counted as 2-3 extra real
        // errors per failed track and tripped the queue stop
        if (this.probing) return;
        if (Date.now() - this.lastProbeTeardown < 2_000) return;
        this.onError("Audio playback error");
      });
      // buffering visibility: the old engine only polled state every 400 ms
      // and only while the tick ran, so a stalled stream showed as paused
      for (const ev of ["waiting", "stalled"] as const) {
        this.audio.addEventListener(ev, () => {
          this.onState({ ...this.getState(), buffering: true });
        });
      }
      for (const ev of ["playing", "canplay", "progress"] as const) {
        this.audio.addEventListener(ev, () => {
          if (this.probing) return;
          this.onState(this.getState());
        });
      }
    }
    return this.audio;
  }

  /**
   * Try to play a same-origin proxied audio stream. Resolves true if the
   * stream actually started delivering audio data, false otherwise.
   */
  private tryProxiedAudio(videoId: string, startSec: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const a = this.ensureAudio();
      const gen = this.loadGen;
      let settled = false;
      const cleanup = () => {
        a.removeEventListener("canplay", onOk);
        a.removeEventListener("loadedmetadata", onOk);
        a.removeEventListener("playing", onOk);
        a.removeEventListener("error", onFail);
      };
      const onOk = () => {
        if (settled) return;
        settled = true;
        cleanup();
        // a stale attempt (a newer load() started meanwhile) must not touch
        // the live probing flag — its "success" belongs to a dead ladder
        if (gen !== this.loadGen) return resolve(false);
        this.probing = false;
        resolve(true);
      };
      const onFail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (gen !== this.loadGen) return resolve(false); // don't kill the newer src
        this.probing = false;
        this.killAudioSrc();
        resolve(false);
      };
      this.probing = true;
      a.src = streamUrl(videoId);
      a.addEventListener("canplay", onOk);
      a.addEventListener("loadedmetadata", onOk);
      a.addEventListener("playing", onOk);
      a.addEventListener("error", onFail);
      a.currentTime = 0;
      a.play().catch(() => {
        // autoplay refusal: metadata may still be loading, keep probing;
        // if nothing arrives at all the timeout below handles it
      });
      // patient start watchdog: a proxy stream with NO data after 15 s is
      // dead (origin down, rate-limited); one that is downloading but
      // slow keeps its full 45 s budget. The fixed 15 s kill abandoned
      // streams that would have played (throttled networks).
      this.armStartWatchdog(a, 15_000, 45_000, onFail);
      void startSec;
    });
  }

  /**
   * Fast path: ask the server for the resolved googlevideo URL (JSON, not
   * the byte proxy) and hand it straight to the <audio> element.
   *
   * The server and the player run on the same machine, so the URL's IP
   * lock matches and the browser's own HTTP stack does the fetching —
   * no proxy hop, and Chromium starts buffering the moment metadata
   * lands. This is the Spotube pattern, and a real media element with a
   * direct URL is also what makes Windows SMTC (taskbar media controls)
   * register with our metadata.
   *
   * On a 403 (URL expired / different egress IP) we fall back to the
   * byte-for-byte proxy in tryProxiedAudio.
   */
  private async tryDirectAudio(
    videoId: string,
    startSec: number,
    srcType: "resolved" | "proxy"
  ): Promise<boolean> {
    let url: string;
    if (srcType === "resolved") {
      try {
        const r = await fetch(streamUrl(videoId, true), { cache: "no-store" });
        if (!r.ok) return false;
        const d = (await r.json()) as { url?: string | null; proxied?: boolean };
        if (!d.url) return false;
        // instance (Piped/Invidious) URLs are cross-origin and must run
        // through the same-origin byte proxy; only googlevideo URLs from
        // InnerTube/yt-dlp go straight into the <audio> element
        url = d.proxied ? streamUrl(videoId) : d.url;
      } catch {
        return false;
      }
    } else {
      url = streamUrl(videoId);
    }

    return new Promise<boolean>((resolve) => {
      const a = this.ensureAudio();
      const gen = this.loadGen;
      let settled = false;
      const cleanup = () => {
        a.removeEventListener("playing", onOk);
        a.removeEventListener("canplay", onOk);
        a.removeEventListener("error", onFail);
      };
      const onOk = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (gen !== this.loadGen) return resolve(false); // stale attempt
        this.probing = false;
        resolve(true);
      };
      const onFail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (gen !== this.loadGen) return resolve(false); // stale attempt
        this.probing = false;
        this.killAudioSrc();
        resolve(false);
      };
      this.probing = true;
      // the crossOrigin hint keeps the element in the media pipeline
      // (needed for SMTC) without requiring CORS on googlevideo
      a.crossOrigin = null;
      a.src = url;
      a.addEventListener("playing", onOk);
      a.addEventListener("canplay", onOk);
      a.addEventListener("error", onFail);
      a.currentTime = 0;
      a.play().catch(() => {
        /* autoplay refusal — the timeout below decides */
      });
      // patient start watchdog: a direct URL that produced no data at all
      // after 12 s is dead (expired, bot-gated); one that is downloading
      // keeps its full 30 s budget. The fixed 8 s kill assumed "known-good
      // or 403 immediately" — false on slow networks, where it murdered
      // streams that would have started.
      this.armStartWatchdog(a, 12_000, 30_000, onFail);
      void startSec;
    });
  }

  private startTick() {
    if (this.tick) return;
    this.tick = setInterval(() => {
      if (this.usingMpv && this.mpv) {
        // refresh the async mpv state in the background; emit the cached
        // value synchronously so the UI never starves
        this.mpv
          .state()
          .then((s) => {
            if (!this.usingMpv || !s) return;
            this.mpvStateCache = {
              playing: s.playing,
              position: s.position,
              duration: s.duration,
              buffering: s.buffering,
              eofReached: !!s.eofReached,
              idleActive: !!s.idleActive,
            };
            this.onState(this.mpvStateCache);
            // END-OF-SONG ADVANCE (the one v1.7.7 lost): keep-open=always
            // makes mpv pause at EOF and NEVER send end-file(reason=eof) —
            // mpv's playloop flips stop_play to KEEP_PLAYING before
            // end_current_file ever runs, so the queue sat in silence after
            // every natural track end. eof-reached=true in the polled state
            // is the signal that actually arrives.
            if (
              s.eofReached &&
              !this.mpvEofFired &&
              this.mpvLoadedVideoId === this.currentVideoId &&
              !this.mpvPendingVideoId
            ) {
              this.mpvEofFired = true;
              this.onEnded();
            }
          })
          .catch(() => {});
        if (this.mpvStateCache) this.onState(this.mpvStateCache);
        return;
      }
      const s = this.getState();
      this.onState(s);
    }, 400);
  }

  /** apply the stored volume to whichever engine is live; safe at any time */
  applyVolume(v: number) {
    const vol = Math.max(0, Math.min(100, Math.round(v * 100)));
    // remember for mpv: every fresh mpv load boots at volume 100 and needs
    // the user's current setting re-applied on the new track
    this.lastVolumePct = vol;
    if (this.usingMpv && this.mpv) {
      void this.mpv.volume(vol).catch(() => {});
      return;
    }
    if (this.audio) this.audio.volume = vol / 100;
    try {
      this.yt?.setVolume?.(vol);
    } catch {
      /* yt not ready yet — setVolume on creation covers it */
    }
  }

  private stopYT() {
    try {
      this.yt?.stopVideo?.();
      this.yt?.clearVideo?.();
    } catch {
      /* noop */
    }
  }

  private stopAudio() {
    if (this.audio) {
      this.audio.pause();
    }
  }

  private async ensureYT(): Promise<any> {
    await loadYT();
    if (this.yt) return this.yt;
    if (!this.hostEl) throw new Error("no host element for youtube player");
    const host = document.createElement("div");
    this.hostEl.appendChild(host);
    return new Promise((resolve, reject) => {
      this.yt = new window.YT.Player(host, {
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          rel: 0,
          fs: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            resolve(this.yt);
          },
          onStateChange: (e: any) => {
            if (e.data === 0) this.onEnded();
            this.onState(this.getState());
          },
          onError: (e: any) => {
            const code = e?.data;
            // remember embed-refusals (100: removed, 101/150: embedding
            // disabled) so the next attempt on this video skips the embed
            // and fails fast instead of repeating the whole 30 s chain
            if (code === 100 || code === 101 || code === 150) {
              if (this.currentVideoId) ytDeadEmbeds.set(this.currentVideoId, Date.now() + YT_DEAD_TTL);
            }
            // the embed was the last resort after direct and proxied
            // streams failed. Before giving up, re-run both audio paths
            // once — the failed attempt just expired the resolver cache
            // (fresh re-resolve), so an instance may answer now. Guarded
            // per videoId: the retry re-enters load(), and an unguarded
            // retry loops forever (v1.6.9 bug: every track spun
            // direct→proxy→iframe→error→load with no error ever shown).
            if (
              this.currentTrack &&
              this.iframeRetriedFor !== this.currentTrack.videoId
            ) {
              this.iframeRetriedFor = this.currentTrack.videoId;
              const pos = this.getState().position;
              void this.load(this.currentTrack, pos);
              return;
            }
            if (code === 153 || code === 2 || code === 5) {
              this.onError(
                "YouTube refused playback in this browser environment — try opening the app in a normal browser tab"
              );
            } else if (code === 100) {
              this.onError("Track unavailable");
            } else if (code === 101 || code === 150) {
              this.onError(
                "Playback blocked by the uploader for embedded players"
              );
            } else {
              this.onError("Playback error");
            }
          },
        },
      });
    });
  }

  async load(track: Track, startSec = 0): Promise<void> {
    // generation guard: every await below re-checks `gen` — if a newer load
    // started meanwhile, this one must return WITHOUT mutating engine state
    // (two ladders running to completion used to race for the shared audio
    // element and the last one to resolve won, regardless of the queue index)
    const gen = ++this.loadGen;
    // invalidate any probe still armed for the previous track: its 8/15s
    // timer must not settle this attempt (rapid skips used to trigger
    // exactly that, failing a source that was fine)
    this.clearProbes();
    this.currentTrack = track;
    this.currentVideoId = track.videoId;

    // downloaded copy first — enables offline listening (local blob URLs
    // stay on the HTML5 element; shipping 150 MB blobs over IPC to mpv
    // buys nothing)
    const local = await idbGetAudio(track.videoId).catch(() => null);
    if (gen !== this.loadGen) return;
    if (local) {
      await this.mpvStop();
      if (gen !== this.loadGen) return;
      this.stopYT();
      this.currentIsAudio = true;
      const a = this.ensureAudio();
      const url = URL.createObjectURL(local.blob);
      a.src = url;
      a.addEventListener("loadedmetadata", () => {
        URL.revokeObjectURL(url);
      }, { once: true });
      a.currentTime = startSec;
      await a.play().catch(() => {});
      this.startTick();
      return;
    }

    // the mpv core (Musify's engine): its own demuxer + network stack via
    // the byte proxy. Tried FIRST for network tracks — it is the robust
    // path; HTML5 direct/proxy/iframe remain the fallback ladder below.
    if (this.mpvReady) {
      const viaMpv = await this.tryMpv(track.videoId, startSec);
      if (gen !== this.loadGen) return; // superseded — newer load owns the engine
      if (viaMpv) {
        this.currentIsAudio = true; // state plumbing treats "audio" as the non-iframe mode
        this.stopAudio();
        this.stopYT();
        this.startTick();
        this.warmNext();
        return;
      }
    }

    // direct stream (fast path): the server resolves the URL once
    // (~150-400 ms via InnerTube) and the browser fetches it itself —
    // no proxy hop. Falls back to the byte proxy, then the IFrame embed.
    await this.mpvStop();
    if (gen !== this.loadGen) return;
    this.mpvStateCache = null;
    this.stopAudio();
    const direct = await this.tryDirectAudio(track.videoId, startSec, "resolved");
    if (gen !== this.loadGen) return;
    if (direct) {
      this.currentIsAudio = true;
      this.stopYT();
      if (startSec > 0) {
        try {
          this.audio!.currentTime = startSec;
        } catch {
          /* seek before metadata is fine to skip */
        }
      }
      this.startTick();
      this.warmNext();
      return;
    }
    const proxied = await this.tryProxiedAudio(track.videoId, startSec);
    if (gen !== this.loadGen) return;
    if (proxied) {
      this.currentIsAudio = true;
      this.stopYT();
      if (startSec > 0) {
        try {
          this.audio!.currentTime = startSec;
        } catch {
          /* seek before metadata is fine to skip */
        }
      }
      this.startTick();
      this.warmNext();
      return;
    }

    // fallback: YouTube IFrame embed. Skipped entirely when the embed
    // already refused this video recently (100/101/150) — repeating the
    // full chain for a known-dead video was 30 s of dead air per click.
    if (isYtEmbedDead(track.videoId)) {
      this.currentIsAudio = false;
      this.stopAudio();
      this.startTick();
      this.onLoadFailed("This track can't play on your network — try another song");
      return;
    }
    // loadYT() can now reject (script blocked) — without the catch, a
    // rejected promise in an async load() was an unhandled rejection and
    // the UI never learned playback failed.
    this.currentIsAudio = false;
    this.stopAudio();
    this.startTick();
    try {
      const yt = await this.ensureYT();
      if (gen !== this.loadGen) return; // superseded while the API booted
      yt.loadVideoById({
        videoId: track.videoId,
        startSeconds: Math.floor(startSec),
      });
      yt.playVideo();
      // if the embed never signals life (blocked script, bot-gated embed,
      // autoplay refused), surface a failure instead of leaving a zombie
      // engine that "automatically pauses" on the next play click
      this.armProbeTimer(12_000, () => {
        const st = this.getState();
        if (
          this.currentVideoId === track.videoId &&
          !st.playing &&
          st.position === 0 &&
          !st.buffering
        ) {
          this.onLoadFailed("Couldn't start playback — open Diagnostics for details");
        }
      });
    } catch {
      this.onLoadFailed("Couldn't start any stream — check your connection");
    }
  }

  getVideoMode(): boolean {
    // v1.7.4: the visible video player is gone; the hidden embed remains
    // as the audio fallback. Kept for the diagnostics surface.
    return false;
  }

  /** the track the engine is holding (read-only, for retry flows) */
  getTrack(): Track | null {
    return this.currentTrack;
  }

  async play(): Promise<void> {
    // mpv mode: the zombie guard is simpler — mpv either has the file
    // loaded (duration > 0) or it doesn't; reload if not
    if (this.usingMpv && this.mpv) {
      const s = await this.mpv.state().catch(() => null);
      if (s && s.duration > 0) {
        // keep-open parks mpv paused AT EOF — resuming from there would
        // immediately re-hit EOF, so replay from the top instead (and let
        // the EOF watcher fire again for the next advance)
        if (s.eofReached) {
          this.mpvEofFired = false;
          await this.mpv.seek(0).catch(() => {});
        }
        await this.mpv.play().catch(() => {});
        return;
      }
      if (this.currentTrack) {
        await this.load(this.currentTrack, this.getState().position);
      }
      return;
    }
    // zombie guard: after a total failure the engine has no live source
    // (empty audio src, YT player never started). toggle() used to set
    // isPlaying=true here, the 400ms tick then synced playing:false back,
    // and the button "automatically paused" — the reported symptom.
    // Reloading the track instead makes the play button retry for real.
    const audioAlive =
      this.currentIsAudio && !!this.audio?.src && !this.audio.ended;
    const ytAlive = (() => {
      try {
        return (
          !this.currentIsAudio &&
          !!this.yt?.getPlayerState &&
          this.yt.getPlayerState() !== -1 &&
          this.yt.getPlayerState() !== 5
        );
      } catch {
        return false;
      }
    })();
    if (!audioAlive && !ytAlive && this.currentTrack) {
      this.iframeRetriedFor = null; // a manual play deserves a fresh retry
      await this.load(this.currentTrack, this.getState().position);
      return;
    }
    if (this.currentIsAudio) await this.audio?.play().catch(() => {});
    else
      try {
        this.yt?.playVideo();
      } catch {
        /* noop */
      }
  }

  pause(): void {
    if (this.usingMpv && this.mpv) {
      void this.mpv.pause().catch(() => {});
      return;
    }
    if (this.currentIsAudio) this.audio?.pause();
    else
      try {
        this.yt?.pauseVideo();
      } catch {
        /* noop */
      }
  }

  seek(sec: number): void {
    if (this.usingMpv && this.mpv) {
      // any manual seek un-latches the one-shot EOF advance — repeat-one
      // replays the SAME loaded file (keep-open), so without this the
      // second playthrough would sit at EOF forever
      this.mpvEofFired = false;
      void this.mpv.seek(sec).catch(() => {});
      this.onState(this.getState());
      return;
    }
    if (this.currentIsAudio && this.audio) this.audio.currentTime = sec;
    else if (this.yt?.seekTo) this.yt.seekTo(sec, true);
    this.onState(this.getState());
  }

  setVolume(v: number): void {
    this.applyVolume(v);
  }

  getState(): EngineState {
    // mpv state is cached here — getState is synchronous (called from the
    // 400 ms tick and UI handlers), the bridge is async; tryMpv's
    // file-loaded + the tick refresh mpvState below.
    if (this.usingMpv) {
      const s = this.mpvStateCache;
      if (s) return s;
      return { playing: false, position: 0, duration: 0, buffering: true };
    }
    let playing = false;
    let position = 0;
    let duration = 0;
    let buffering = false;
    if (this.currentIsAudio && this.audio) {
      playing = !this.audio.paused && !this.audio.ended;
      position = this.audio.currentTime;
      duration = isFinite(this.audio.duration) ? this.audio.duration : 0;
    } else if (this.yt?.getPlayerState) {
      try {
        const st = this.yt.getPlayerState();
        playing = st === 1;
        buffering = st === 3;
        position = this.yt.getCurrentTime() || 0;
        duration = this.yt.getDuration() || 0;
      } catch {
        /* noop */
      }
    }
    return { playing, position, duration, buffering };
  }
}

export const engine = new PlayerEngine();

/**
 * Debug surface for diagnostics: window.resonaEngine() returns a snapshot
 * of the engine's playback state and recent error history. Used by the
 * E2E tests and support flows (Settings → About can print it); tiny by
 * design — no live references, just a snapshot.
 */
declare global {
  interface Window {
    resonaEngine?: () => {
      videoId: string | null;
      isAudio: boolean;
      ytState: number | null;
      audioSrc: string | null;
      usingMpv: boolean;
      lastErrors: { at: number; msg: string }[];
    };
  }
}

const errLog: { at: number; msg: string }[] = [];
const origOnError = engine.onError;
engine.onError = (msg) => {
  errLog.push({ at: Date.now(), msg });
  if (errLog.length > 10) errLog.shift();
  origOnError(msg);
};
const origOnLoadFailed = engine.onLoadFailed;
engine.onLoadFailed = (msg) => {
  errLog.push({ at: Date.now(), msg: `LOAD_FAILED: ${msg}` });
  if (errLog.length > 10) errLog.shift();
  origOnLoadFailed(msg);
};

if (typeof window !== "undefined") {
  window.resonaEngine = () => ({
    videoId: engine.currentVideoId,
    isAudio: engine.currentIsAudio,
    ytState: (() => {
      try {
        return engine.getVideoMode() ? (engine as any).yt?.getPlayerState?.() ?? null : null;
      } catch {
        return null;
      }
    })(),
    audioSrc: (engine as any).audio?.src || null,
    usingMpv: (engine as any).usingMpv === true,
    lastErrors: [...errLog],
  });
}
