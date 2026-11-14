"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { DownloadButton } from "@/components/track/DownloadButton";
import { formatDuration, cx, hueFromId } from "@/lib/format";
import type { Lyrics } from "@/lib/types";
import {
  ChevronDown,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Video,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { TrackMenu } from "@/components/track/TrackMenu";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileNowPlaying } from "@/components/player/MobileNowPlaying";
import { QueuePanel, LyricsPanel } from "@/components/player/PlayerPanels";

type Panel = "info" | "lyrics";

export function FullPlayer() {
  const player = usePlayer();
  const ui = useUi();
  const library = useLibrary();
  const settings = useSettings();
  const track = player.current();
  const [panel, setPanel] = useState<Panel>("info");
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  useEffect(() => {
    if (!ui.fullPlayer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.setFullPlayer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.fullPlayer]);

  // fetch lyrics per track
  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    const load = async () => {
      setLyrics(null);
      setLyricsLoading(true);
      try {
        const r = await fetch(
          `/api/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(
            track.artist
          )}&duration=${Math.round(player.duration || track.duration || 0)}`
        );
        const d: Lyrics = await r.json();
        if (!cancelled) setLyrics(d);
      } catch {
        /* leave empty */
      } finally {
        if (!cancelled) setLyricsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
     
  }, [track?.videoId]);

  const liked = track ? library.isLiked(track.videoId) : false;
  const isMobile = useIsMobile();
  const hue = hueFromId(track?.videoId ?? "");

  return (
    <AnimatePresence>
      {ui.fullPlayer && track && (
        <motion.div
          key="fullplayer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 overflow-hidden bg-background"
        >
          {/* blurred artwork backdrop — depth from the music itself */}
          <img
            src={track.thumb}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-20 blur-3xl grayscale"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
          {/* per-track colour wash — the ambient look from the mockup */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background: `radial-gradient(900px 520px at 22% 0%, hsl(${hue} 60% 30% / 0.55), transparent 70%)`,
            }}
          />

          {isMobile ? (
            <MobileNowPlaying
              track={track}
              lyrics={lyrics}
              lyricsLoading={lyricsLoading}
              onClose={() => ui.setFullPlayer(false)}
            />
          ) : (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.55 }}
            className="relative mx-auto flex h-full max-w-5xl flex-col px-4 pb-6 pt-4 md:px-8"
          >
            {/* header */}
            <div className="flex items-center justify-between">
              <div className="truncate text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {player.contextLabel || "Now playing"}
              </div>
              <div className="flex items-center gap-1">
                <button
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                    settings.showVideo && "bg-accent text-foreground"
                  )}
                  onClick={() => settings.setShowVideo(!settings.showVideo)}
                  aria-label="Toggle video"
                  title="Toggle video"
                >
                  <Video className="h-4 w-4" />
                </button>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => ui.setFullPlayer(false)}
                  aria-label="Close player"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-2 grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-2">
              {/* left: art + controls */}
              <div className="flex min-h-0 flex-col items-center justify-center gap-5">
                <motion.div
                  key={track.videoId}
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.25, duration: 0.6 }}
                  className="relative aspect-square w-52 overflow-hidden rounded-2xl bg-muted shadow-float sm:w-60 md:w-64"
                >
                  <img src={track.thumb} alt={track.title} className="h-full w-full object-cover" />
                </motion.div>
                <div className="w-full max-w-md text-center">
                  <div className="truncate text-xl font-bold tracking-tight md:text-2xl">{track.title}</div>
                  <div className="mt-1 truncate text-sm text-muted-foreground">{track.artist}</div>
                </div>

                <div className="w-full max-w-md">
                  <Slider
                    value={[player.position]}
                    max={player.duration || 1}
                    step={1}
                    onValueChange={([v]) => player.seek(v)}
                    aria-label="Seek"
                  />
                  <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
                    <span>{formatDuration(player.position)}</span>
                    <span>{formatDuration(player.duration)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                      player.shuffle && "text-foreground"
                    )}
                    onClick={player.toggleShuffle}
                    aria-label="Shuffle"
                  >
                    <Shuffle className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    onClick={player.prev}
                    aria-label="Previous"
                  >
                    <SkipBack className="h-5 w-5 fill-current" />
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", bounce: 0.5 }}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float"
                    onClick={player.toggle}
                    aria-label={player.isPlaying ? "Pause" : "Play"}
                  >
                    {player.isPlaying ? (
                      <Pause className="h-6 w-6 fill-current" />
                    ) : (
                      <Play className="h-6 w-6 translate-x-[2px] fill-current" />
                    )}
                  </motion.button>
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    onClick={player.next}
                    aria-label="Next"
                  >
                    <SkipForward className="h-5 w-5 fill-current" />
                  </button>
                  <button
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                      player.repeat !== "off" && "text-foreground"
                    )}
                    onClick={player.cycleRepeat}
                    aria-label="Repeat"
                  >
                    {player.repeat === "one" ? <Repeat1 className="h-[18px] w-[18px]" /> : <Repeat className="h-[18px] w-[18px]" />}
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <motion.button
                    whileTap={{ scale: 1.25 }}
                    transition={{ type: "spring", bounce: 0.6 }}
                    className={cx(
                      "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                      liked && "text-foreground"
                    )}
                    onClick={() => library.toggleLike(track)}
                  >
                    <Heart className={cn("h-4 w-4", liked && "fill-current")} /> Like
                  </motion.button>
                  <DownloadButton track={track} labelled className="px-3 py-2" />
                  <TrackMenu
                    track={track}
                    trigger={
                      <button className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" /> More
                      </button>
                    }
                  />
                </div>
              </div>

              {/* right: panels */}
              <div className="flex min-h-0 flex-col">
                <div className="flex justify-center gap-1 rounded-full border border-border bg-card/60 p-1 text-sm backdrop-blur">
                  {(["info", "lyrics"] as Panel[]).map((p) => (
                    <button
                      key={p}
                      className={cx(
                        "relative flex-1 rounded-full px-3 py-1.5 transition-colors",
                        panel === p ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setPanel(p)}
                    >
                      {panel === p && (
                        <motion.span
                          layoutId="fp-panel"
                          className="absolute inset-0 rounded-full bg-foreground"
                          transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                        />
                      )}
                      <span className="relative z-10">{p === "info" ? "Up next" : "Lyrics"}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card/50 backdrop-blur">
                  {panel === "info" ? (
                    <QueuePanel />
                  ) : (
                    <LyricsPanel
                      lyrics={lyrics}
                      loading={lyricsLoading}
                      position={player.position}
                      onSeek={player.seek}
                      isSynced={!!lyrics?.synced}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* mobile progress footer */}
            <div className="mt-2 flex items-center gap-2 md:hidden">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-foreground/80"
                  style={{
                    width: `${
                      player.duration > 0 ? (player.position / player.duration) * 100 : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

