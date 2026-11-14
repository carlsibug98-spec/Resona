"use client";

import { useEffect, useRef } from "react";
import { engine } from "@/lib/player-engine";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import type { Track } from "@/lib/types";

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
      usePlayer.getState().syncFromEngine(s);
    };
    engine.onEnded = () => {
      const p = usePlayer.getState();
      if (p.repeat === "one") {
        engine.seek(0);
        engine.play();
      } else {
        p.next();
      }
    };
    engine.onError = (msg) => {
      import("sonner").then(({ toast }) => toast.error(msg));
      const p = usePlayer.getState();
      consecutiveErrors += 1;
      if (consecutiveErrors <= 3 && p.queue.length > 1) {
        setTimeout(() => p.next(), 400);
      } else {
        engine.pause();
        usePlayer.setState({ isPlaying: false });
        if (consecutiveErrors > 3)
          import("sonner").then(({ toast }) =>
            toast.error("Stopped: too many unavailable tracks in a row")
          );
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
      } catch {
        /* media session not fully supported */
      }
    }
  }, [track?.videoId]);

  const showVideo = useSettings((s) => s.showVideo);
  const fullPlayer = useUi((s) => s.fullPlayer);
  const visibleVideo = showVideo && fullPlayer && !!track;

  return (
    <div
      ref={hostRef}
      id="resona-yt-host"
      aria-hidden="true"
      className={
        visibleVideo
          ? "fixed z-40 bottom-44 left-1/2 -translate-x-1/2 w-80 h-44 rounded-xl overflow-hidden shadow-2xl border bg-black"
          : "fixed -z-10 bottom-0 right-0 w-[220px] h-[160px] overflow-hidden opacity-[0.01] pointer-events-none"
      }
    />
  );
}
