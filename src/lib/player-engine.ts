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

export interface EngineState {
  playing: boolean;
  position: number;
  duration: number;
  buffering: boolean;
}

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
        this.probing = false;
        cleanup();
        resolve(true);
      };
      const onFail = () => {
        if (settled) return;
        settled = true;
        this.probing = false;
        cleanup();
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
      let settled = false;
      const cleanup = () => {
        a.removeEventListener("playing", onOk);
        a.removeEventListener("canplay", onOk);
        a.removeEventListener("error", onFail);
      };
      const onOk = () => {
        if (settled) return;
        settled = true;
        this.probing = false;
        cleanup();
        resolve(true);
      };
      const onFail = () => {
        if (settled) return;
        settled = true;
        this.probing = false;
        cleanup();
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
      const s = this.getState();
      this.onState(s);
    }, 400);
  }

  /** apply the stored volume to whichever engine is live; safe at any time */
  applyVolume(v: number) {
    const vol = Math.max(0, Math.min(100, Math.round(v * 100)));
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
    // invalidate any probe still armed for the previous track: its 8/15s
    // timer must not settle this attempt (rapid skips used to trigger
    // exactly that, failing a source that was fine)
    this.clearProbes();
    this.currentTrack = track;
    this.currentVideoId = track.videoId;

    // downloaded copy first — enables offline listening
    const local = await idbGetAudio(track.videoId).catch(() => null);
    if (local) {
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

    // direct stream first (fast path): the server resolves the URL once
    // (~150-400 ms via InnerTube) and the browser fetches it itself —
    // no proxy hop. Falls back to the byte proxy, then the IFrame embed.
    this.stopAudio();
    const direct = await this.tryDirectAudio(track.videoId, startSec, "resolved");
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
    if (this.currentIsAudio) this.audio?.pause();
    else
      try {
        this.yt?.pauseVideo();
      } catch {
        /* noop */
      }
  }

  seek(sec: number): void {
    if (this.currentIsAudio && this.audio) this.audio.currentTime = sec;
    else if (this.yt?.seekTo) this.yt.seekTo(sec, true);
    this.onState(this.getState());
  }

  setVolume(v: number): void {
    this.applyVolume(v);
  }

  getState(): EngineState {
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
    lastErrors: [...errLog],
  });
}
