"use client";

import { useEffect, useRef } from "react";
import { engine } from "@/lib/player-engine";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toast";
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
      toast(msg);
      const p = usePlayer.getState();
      consecutiveErrors += 1;
      if (consecutiveErrors <= 3 && p.queue.length > 1) {
        setTimeout(() => p.next(), 400);
      } else {
        engine.pause();
        usePlayer.setState({ isPlaying: false });
        if (consecutiveErrors > 3)
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
  const nfMode = useUi((s) => s.nfMode);
  // the real YouTube video docks into the mockup's video slot
  const visibleVideo = showVideo && fullPlayer && nfMode === "video" && !!track;

  return (
    <div
      ref={hostRef}
      id="resona-yt-host"
      aria-hidden={!visibleVideo}
      className={visibleVideo ? "nf-video-live" : "yt-host-hidden"}
    />
  );
}
