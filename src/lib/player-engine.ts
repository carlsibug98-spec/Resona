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
  ytPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
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

  onState: Listener = () => {};
  onEnded: () => void = () => {};
  onError: (msg: string) => void = () => {};
  onVideoReady: () => void = () => {};

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

  private startTick() {
    if (this.tick) return;
    this.tick = setInterval(() => {
      const s = this.getState();
      this.onState(s);
    }, 400);
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

    // proxied direct stream — works everywhere the IFrame embed does not
    // (sandboxed iframes, embedded webviews, restricted browsers)
    this.stopAudio();
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
      return;
    }

    // fallback: YouTube IFrame embed
    this.currentIsAudio = false;
    this.stopAudio();
    this.startTick();
    const yt = await this.ensureYT();
    yt.loadVideoById({
      videoId: track.videoId,
      startSeconds: Math.floor(startSec),
    });
    yt.playVideo();
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
    const vol = Math.max(0, Math.min(100, Math.round(v * 100)));
    if (this.audio) this.audio.volume = vol / 100;
    try {
      this.yt?.setVolume?.(vol);
    } catch {
      /* noop */
    }
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
