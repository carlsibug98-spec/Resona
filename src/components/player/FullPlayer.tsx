"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { downloadTrack } from "@/lib/downloads";
import { formatDuration, cx } from "@/lib/format";
import type { Lyrics, Track } from "@/lib/types";
import {
  ChevronDown,
  Download,
  Heart,
  MicVocal,
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
import { EqBars } from "@/components/track/EqBars";
import { useTrackDuration } from "@/stores/durations";
import { cn } from "@/lib/utils";

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
                  <button
                    className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    onClick={async () => {
                      toastInfo("Downloading…");
                      const status = await downloadTrack(track);
                      if (status === "offline-saved") toastInfo("Saved offline");
                      else if (status === "stream-only") toastInfo("Stream-only (no resolver)");
                      else toastInfo("Download failed");
                    }}
                  >
                    <Download className="h-4 w-4" /> Download
                  </button>
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function toastInfo(msg: string) {
  import("sonner").then(({ toast }) => toast(msg));
}

function QueuePanel() {
  const player = usePlayer();
  if (!player.queue.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        Queue is empty — play something to build it up
      </div>
    );
  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-2">
      {player.queue.map((t, i) => (
        <QueueRow key={`${t.videoId}-${i}`} track={t} index={i} />
      ))}
    </div>
  );
}

function QueueRow({ track, index }: { track: Track; index: number }) {
  const player = usePlayer();
  const duration = useTrackDuration(track);
  const isCur = index === player.index;
  return (
    <button
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors",
        isCur ? "bg-accent" : "hover:bg-accent/60"
      )}
      onClick={() => player.playFromQueue(index)}
    >
      <span className="flex w-6 items-center justify-center text-xs tabular-nums text-muted-foreground">
        {isCur ? (
          <EqBars playing={player.isPlaying} className="h-3 text-foreground" />
        ) : (
          index + 1
        )}
      </span>
      <img src={track.thumb} alt="" className="h-9 w-9 rounded-md object-cover" />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-medium", isCur && "text-foreground")}>{track.title}</div>
        <div className="truncate text-xs text-muted-foreground">{track.artist}</div>
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatDuration(duration)}
      </span>
    </button>
  );
}

function LyricsPanel({
  lyrics,
  loading,
  position,
  onSeek,
  isSynced,
}: {
  lyrics: Lyrics | null;
  loading: boolean;
  position: number;
  onSeek: (s: number) => void;
  isSynced: boolean;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const activeIdx = useMemo(() => {
    if (!lyrics?.synced) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.synced.length; i++) {
      if (lyrics.synced[i].t <= position + 0.3) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, position]);

  useEffect(() => {
    if (isSynced && activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIdx, isSynced]);

  if (loading)
    return (
      <div className="space-y-4 p-7">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-5 animate-pulse rounded-md bg-accent"
            style={{ width: `${55 + ((i * 17) % 40)}%` }}
          />
        ))}
      </div>
    );

  if (!lyrics || (!lyrics.synced && !lyrics.plain))
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
        <MicVocal className="h-9 w-9 opacity-30" />
        No lyrics found for this track
      </div>
    );

  if (lyrics.synced)
    return (
      <div className="h-full overflow-y-auto scrollbar-thin p-7">
        {lyrics.synced.map((line, i) => (
          <button
            key={i}
            ref={i === activeIdx ? activeRef : undefined}
            onClick={() => onSeek(line.t)}
            className={cx(
              "block w-full py-1.5 text-left text-lg leading-relaxed transition-all duration-300",
              i === activeIdx
                ? "scale-[1.01] font-bold text-foreground"
                : i < activeIdx
                  ? "text-muted-foreground/50 hover:text-muted-foreground"
                  : "text-muted-foreground hover:text-foreground"
            )}
          >
            {line.text || "♪"}
          </button>
        ))}
        <div className="pt-3 text-[10px] uppercase tracking-widest text-muted-foreground/50">
          Synced lyrics · {lyrics.source}
        </div>
      </div>
    );

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-7">
      <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground/90">
        {lyrics.plain}
      </pre>
      <div className="pt-3 text-[10px] uppercase tracking-widest text-muted-foreground/50">
        Lyrics · {lyrics.source}
      </div>
    </div>
  );
}
