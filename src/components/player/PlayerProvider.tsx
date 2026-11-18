"use client";

import { useEffect, useRef } from "react";
import { engine } from "@/lib/player-engine";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { usePlaybackError } from "@/stores/playback-error";
import { PlaybackErrorBanner } from "@/components/player/PlaybackErrorBanner";
import { toast } from "@/stores/toast";
import type { Track } from "@/lib/types";
/**
 * When the queue runs out, keep the music going: pull the song radio for
 * the last track and continue. Toggleable in Settings → Playback.
 */
async function maybeStartRadio() {
  const settings = useSettings.getState();
  if (!settings.autoplayRadio) return;
  const p = usePlayer.getState();
  const seed = p.current();
  if (!seed) return;
  try {
    const res = await fetch(`/api/radio?videoId=${encodeURIComponent(seed.videoId)}`);
    if (!res.ok) return;
    const data = await res.json();
    const tracks: Track[] = Array.isArray(data?.tracks) ? data.tracks : [];
    if (!tracks.length) return;
    usePlayer.getState().extendQueue(tracks);
    usePlayer.getState().next();
  } catch {
    /* offline or rate-limited — playback stays stopped */
  }
}

export function PlayerProvider() {
  const hostRef = useRef<HTMLDivElement>(null);
  const bound = useRef(false);

  useEffect(() => {
    if (hostRef.current && !bound.current) {
      engine.attachHost(hostRef.current);
      bound.current = true;
    }
  }, []);

  // engine -> store binding
  useEffect(() => {
    // Musify failure policy (audio_service.dart `_handlePlaybackError`):
    // a failing track auto-skips to the next song after 2 s — the user
    // hears one bad song vanish instead of the whole session stopping —
    // and playback only stops (with the manual Retry banner) after 3
    // CONSECUTIVE failed tracks. Any track that actually plays resets the
    // count. This supersedes the v1.7.3 "never advance on failure" rule,
    // which kept every failure stuck on screen and turned one slow song
    // on a throttled network into "playback stopped on its own".
    const ERROR_SKIP_DELAY_MS = 2_000;
    const MAX_CONSECUTIVE_FAILURES = 3;
    let consecutiveErrors = 0;
    let lastErrorTrack: string | null = null;
    let pendingSkip: {
      videoId: string;
      timer: ReturnType<typeof setTimeout>;
    } | null = null;
    // counts failed TRACKS, not failed attempts: one dead track can
    // legitimately fire several events (embed refusal + audio retry
    // failure); stacking those would stop playback after a single song.
    const noteError = (videoId: string | null) => {
      if (videoId && videoId !== lastErrorTrack) {
        lastErrorTrack = videoId;
        consecutiveErrors += 1;
      }
    };
    const cancelPendingSkip = () => {
      if (pendingSkip) {
        clearTimeout(pendingSkip.timer);
        pendingSkip = null;
      }
    };
    // Musify: "Only retry if still on the same song (user didn't manually
    // change tracks)" — and anything that starts playing cancels the
    // window via onState, so a late-recovering track is never skipped
    // from under the listener.
    const scheduleSkip = (failedVideoId: string, msg: string) => {
      cancelPendingSkip();
      const timer = setTimeout(() => {
        pendingSkip = null;
        const p = usePlayer.getState();
        if (p.current()?.videoId !== failedVideoId) return;
        if (p.next()) return; // next() loads + plays the successor
        // end of queue, nothing to advance to — the failure is terminal
        // for this session, so surface the banner (Retry stays manual)
        usePlaybackError.getState().show(msg, failedVideoId);
      }, ERROR_SKIP_DELAY_MS);
      pendingSkip = { videoId: failedVideoId, timer };
    };
    engine.onState = (s) => {
      if (s.playing) {
        consecutiveErrors = 0;
        lastErrorTrack = null;
        cancelPendingSkip();
        usePlaybackError.getState().clear();
      }
      usePlayer.getState().syncFromEngine(s);
    };
    engine.onEnded = () => {
      const p = usePlayer.getState();
      if (p.repeat === "one") {
        engine.seek(0);
        engine.play();
        return;
      }
      if (p.next()) return;
      void maybeStartRadio();
    };
    // audio/iframe playback error: below the cap → silent auto-skip
    // (no banner — it would just flash during the 2 s window); at the
    // cap → Musify's "Max consecutive errors reached. Stopping playback."
    engine.onError = (msg) => {
      const p = usePlayer.getState();
      const cur = p.current();
      noteError(cur?.videoId ?? null);
      if (consecutiveErrors >= MAX_CONSECUTIVE_FAILURES) {
        cancelPendingSkip();
        if (cur) usePlaybackError.getState().show(msg, cur.videoId);
        else toast(msg);
        return;
      }
      if (cur) scheduleSkip(cur.videoId, msg);
      else toast(msg);
    };
    // load() exhausted every source (audio providers AND the embed) —
    // same policy as onError; this is the "click play, nothing starts"
    // case, where sitting still looks like a frozen app
    engine.onLoadFailed = (msg) => {
      const p = usePlayer.getState();
      const cur = p.current();
      noteError(cur?.videoId ?? null);
      if (consecutiveErrors >= MAX_CONSECUTIVE_FAILURES) {
        cancelPendingSkip();
        if (cur) usePlaybackError.getState().show(msg, cur.videoId);
        return;
      }
      if (cur) scheduleSkip(cur.videoId, msg);
    };
  }, []);

  // Space toggles playback, unless the user is typing or focused on a control
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) ||
          el.getAttribute("role") === "slider" ||
          el.closest('[role="dialog"], [role="menu"], [role="listbox"]'))
      )
        return;
      const p = usePlayer.getState();
      if (!p.queue.length) return;
      e.preventDefault();
      p.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const track = usePlayer((s) => s.queue[s.index] as Track | undefined);

  // keep the engine aware of the queue successor: it warms that track's
  // stream URL while the current one plays, so track changes are instant
  useEffect(() => {
    const s = usePlayer.getState();
    const next = s.queue[s.index + 1];
    engine.setNextTrack(next?.videoId ?? null);
  }, [track?.videoId]);

  // history + media session on track change
  useEffect(() => {
    if (!track) return;
    useLibrary.getState().pushHistory(track);
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: "Resona",
          artwork: [{ src: track.thumb, sizes: "480x360", type: "image/jpeg" }],
        });
        navigator.mediaSession.setActionHandler("play", () =>
          usePlayer.getState().toggle()
        );
        navigator.mediaSession.setActionHandler("pause", () =>
          usePlayer.getState().toggle()
        );
        navigator.mediaSession.setActionHandler("previoustrack", () =>
          usePlayer.getState().prev()
        );
        navigator.mediaSession.setActionHandler("nexttrack", () =>
          usePlayer.getState().next()
        );
        // seek + stop complete the transport: the Windows SMTC overlay
        // (taskbar media flyout, hardware keys) becomes fully functional
        try {
          navigator.mediaSession.setActionHandler("seekbackward", () => {
            const s = usePlayer.getState();
            s.seek(Math.max(0, s.position - 10));
          });
          navigator.mediaSession.setActionHandler("seekforward", () => {
            const s = usePlayer.getState();
            s.seek(s.position + 10);
          });
          navigator.mediaSession.setActionHandler("seekto", (details) => {
            const t = (details as { seekTime?: number }).seekTime;
            if (typeof t === "number") usePlayer.getState().seek(t);
          });
          navigator.mediaSession.setActionHandler("stop", () => {
            const s = usePlayer.getState();
            if (s.isPlaying) s.toggle();
          });
        } catch {
          /* older overlays without seek/stop */
        }
      } catch {
        /* media session not fully supported */
      }
    }
  }, [track?.videoId]);

  // position state feeds the SMTC overlay's scrubber; refreshed in coarse
  // steps so it stays cheap while playing
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    if (typeof navigator.mediaSession.setPositionState !== "function") return;
    if (!duration || !Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(position, duration),
      });
    } catch {
      /* overlays tolerate a missing position state */
    }
  }, [track?.videoId, duration, Math.floor(position / 5)]);

  // v1.7.4: no visible video player anymore — the host div stays as the
  // hidden home of the IFrame embed, which is the last-resort audio
  // source when direct and proxied streams both fail
  return (
    <>
      <div
        ref={hostRef}
        id="resona-yt-host"
        aria-hidden={true}
        className="yt-host-hidden"
      />
      <PlaybackErrorBanner />
    </>
  );
}
