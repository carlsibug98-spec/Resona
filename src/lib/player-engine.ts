"use client";

import type { Track } from "@/lib/types";
import { idbGetAudio } from "@/lib/idb";

 

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

  currentVideoId: string | null = null;
  currentIsAudio = false;
  private currentTrack: Track | null = null;
  private videoMode = false;
  private wasAudioBeforeVideo = true;
  /** the videoId the last iframe→audio retry was used for; one retry per
   * track — load() must NOT reset this (the retry path calls load() again,
   * and resetting here made the retry loop infinite: v1.6.9 bug) */
  private iframeRetriedFor: string | null = null;

  onState: Listener = () => {};
  onEnded: () => void = () => {};
  onError: (msg: string) => void = () => {};
  onVideoReady: () => void = () => {};

  /** the track after the current one — warmed ahead of the gapless switch */
  private nextVideoId: string | null = null;

  /** remembered for enterVideoMode's audio fallback */
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
    fetch(`/api/stream?resolve=1&videoId=${encodeURIComponent(id)}`, {
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
        // them as "this source didn't work" instead of a playback failure
        if (this.probing) return;
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
        a.pause();
        a.removeAttribute("src");
        a.load();
        resolve(false);
      };
      this.probing = true;
      a.src = `/api/stream?videoId=${encodeURIComponent(videoId)}`;
      a.addEventListener("canplay", onOk);
      a.addEventListener("loadedmetadata", onOk);
      a.addEventListener("playing", onOk);
      a.addEventListener("error", onFail);
      a.currentTime = 0;
      a.play().catch(() => {
        // autoplay refusal: metadata may still be loading, keep probing;
        // if nothing arrives at all the timeout below handles it
      });
      setTimeout(() => {
        if (!settled) {
          // still buffering after 15s — give up on this source
          if (a.readyState < 3 && a.currentTime < 0.5) onFail();
          else onOk();
        }
      }, 15_000);
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
        const r = await fetch(
          `/api/stream?resolve=1&videoId=${encodeURIComponent(videoId)}`,
          { cache: "no-store" }
        );
        if (!r.ok) return false;
        const d = (await r.json()) as { url?: string | null; proxied?: boolean };
        if (!d.url) return false;
        // instance (Piped/Invidious) URLs are cross-origin and must run
        // through the same-origin byte proxy; only googlevideo URLs from
        // InnerTube/yt-dlp go straight into the <audio> element
        url = d.proxied
          ? `/api/stream?videoId=${encodeURIComponent(videoId)}`
          : d.url;
      } catch {
        return false;
      }
    } else {
      url = `/api/stream?videoId=${encodeURIComponent(videoId)}`;
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
        a.pause();
        a.removeAttribute("src");
        a.load();
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
      // direct URLs are known-good or 403 immediately; 8s is plenty
      setTimeout(() => {
        if (!settled) {
          if (a.readyState >= 2 && a.currentTime > 0.1) onOk();
          else onFail();
        }
      }, 8_000);
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
            this.onVideoReady();
          },
          onStateChange: (e: any) => {
            if (e.data === 0) this.onEnded();
            this.onState(this.getState());
          },
          onError: (e: any) => {
            const code = e?.data;
            // while the real video is on screen: embedded playback refused
            // for this video/environment — drop back to audio instead of skipping
            if (
              this.videoMode &&
              (code === 2 || code === 5 || code === 100 || code === 101 || code === 150 || code === 153)
            ) {
              const pos = this.getState().position;
              this.videoMode = false;
              this.onError("This video can't play here — back to audio");
              if (this.wasAudioBeforeVideo && this.currentTrack) {
                void this.load(this.currentTrack, pos);
              }
              return;
            }
            // audio mode: the embed was the last resort after direct and
            // proxied streams failed. Before giving up, re-run both audio
            // paths once — the failed attempt just expired the resolver
            // cache (fresh re-resolve), so an instance may answer now.
            // Guarded per videoId: the retry re-enters load(), and an
            // unguarded retry loops forever (v1.6.9 bug: every track spun
            // direct→proxy→iframe→error→load with no error ever shown).
            if (
              !this.videoMode &&
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
    this.currentTrack = track;
    this.currentVideoId = track.videoId;

    // video mode active: keep the visible YouTube player as the source
    if (this.videoMode) {
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
      } catch {
        /* ensureYT onError path reports and the store skips forward */
      }
      return;
    }

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

    // fallback: YouTube IFrame embed. loadYT() can now reject (script
    // blocked) — without the catch, a rejected promise in an async load()
    // was an unhandled rejection and the UI never learned playback failed.
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
    } catch {
      this.onError("Couldn't start any stream — check your connection");
    }
  }

  getVideoMode(): boolean {
    return this.videoMode;
  }

  /**
   * Real music video: hand playback to the YouTube IFrame player at the
   * current position. Falls back to audio when the embed can't load.
   */
  async enterVideoMode(): Promise<void> {
    if (this.videoMode || !this.currentTrack || !this.currentVideoId) return;
    this.videoMode = true;
    this.wasAudioBeforeVideo = this.currentIsAudio;
    const pos = this.getState().position;
    this.stopAudio();
    this.currentIsAudio = false;
    this.startTick();
    try {
      const yt = await this.ensureYT();
      // already playing this exact video (audio path failed earlier)? just show it
      if (yt.getVideoId?.() === this.currentVideoId && yt.getPlayerState?.() === 1) {
        return;
      }
      yt.loadVideoById({
        videoId: this.currentVideoId,
        startSeconds: Math.floor(pos),
      });
      yt.playVideo();
    } catch {
      this.videoMode = false;
      this.onError("Video unavailable right now — continuing with audio");
      if (this.currentTrack) await this.load(this.currentTrack, pos);
    }
  }

  /**
   * Leave video mode: resume audio at the video's position. When audio
   * never worked for this track the hidden YouTube player keeps playing.
   */
  async exitVideoMode(): Promise<void> {
    if (!this.videoMode) return;
    this.videoMode = false;
    if (!this.wasAudioBeforeVideo) return;
    const pos = this.getState().position;
    if (this.currentTrack) await this.load(this.currentTrack, pos);
  }

  async play(): Promise<void> {
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
