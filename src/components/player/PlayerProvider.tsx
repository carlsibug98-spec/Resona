"use client";

import { useEffect, useRef } from "react";
import { engine } from "@/lib/player-engine";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
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
    let consecutiveErrors = 0;
    engine.onState = (s) => {
      if (s.playing) consecutiveErrors = 0;
      if (s.playing) usePlaybackError.getState().clear();
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
    engine.onError = (msg) => {
      const p = usePlayer.getState();
      const cur = p.current();
      // actionable banner instead of a vanishing toast: the user decides
      // retry / skip; environment notes (video-mode fallbacks) stay toasts
      const isTrackFailure = !!cur;
      if (isTrackFailure) {
        usePlaybackError.getState().show(msg, cur.videoId);
      } else {
        toast(msg);
      }
      consecutiveErrors += 1;
      // auto-advance only when the banner is up: single-track queues must
      // not silently burn through (the queue-stop below stays as backstop)
      if (consecutiveErrors <= 3 && p.queue.length > 1) {
        setTimeout(() => {
          // if the user already retried/skipped manually, don't double-fire
          if (usePlaybackError.getState().message) p.next();
        }, 1200);
      } else {
        engine.pause();
        usePlayer.setState({ isPlaying: false });
        if (consecutiveErrors > 3 && isTrackFailure)
          toast("Stopped: too many unavailable tracks in a row");
      }
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

  const showVideo = useSettings((s) => s.showVideo);
  const fullPlayer = useUi((s) => s.fullPlayer);
  const nfMode = useUi((s) => s.nfMode);
  // the real YouTube video docks into the mockup's video slot
  const visibleVideo = showVideo && fullPlayer && nfMode === "video" && !!track;

  // hand playback to the visible video (and back to audio when leaving)
  useEffect(() => {
    if (visibleVideo) void engine.enterVideoMode();
    else void engine.exitVideoMode();
  }, [visibleVideo]);

  // keep the persistent iframe glued to the mockup's video frame —
  // the frame lives in a scrollable body, so track it every frame
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !visibleVideo) return;
    let raf = 0;
    const sync = () => {
      const frame = document.querySelector<HTMLElement>("[data-nf-video-frame]");
      if (frame) {
        const r = frame.getBoundingClientRect();
        host.style.left = `${r.left}px`;
        host.style.top = `${r.top}px`;
        host.style.width = `${r.width}px`;
        host.style.height = `${r.height}px`;
        host.classList.add("docked");
      }
      raf = requestAnimationFrame(sync);
    };
    raf = requestAnimationFrame(sync);
    return () => {
      cancelAnimationFrame(raf);
      host.classList.remove("docked");
    };
  }, [visibleVideo]);

  return (
    <>
      <div
        ref={hostRef}
        id="resona-yt-host"
        aria-hidden={!visibleVideo}
        className={visibleVideo ? "nf-video-live" : "yt-host-hidden"}
      />
      <PlaybackErrorBanner />
    </>
  );
}
