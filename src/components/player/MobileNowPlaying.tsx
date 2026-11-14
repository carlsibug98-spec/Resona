"use client";

import { useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import type { Lyrics, Track } from "@/lib/types";
import { formatDuration, cx } from "@/lib/format";
import { DownloadButton } from "@/components/track/DownloadButton";
import { TrackMenu } from "@/components/track/TrackMenu";
import { Slider } from "@/components/ui/slider";
import { QueuePanel, LyricsPanel } from "@/components/player/PlayerPanels";
import {
  ChevronDown,
  Heart,
  ListMusic,
  MicVocal,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";

type Sheet = "queue" | "lyrics";

/** swipe distances and speeds that count as a gesture */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 600;
const TRACK_SWIPE = 60;
const SHEET_CLOSE_DISTANCE = 100;

/**
 * Phone now-playing screen: large artwork, swipe the cover to change
 * track, drag the header down to close, lyrics and queue in bottom sheets.
 */
export function MobileNowPlaying({
  track,
  lyrics,
  lyricsLoading,
  onClose,
}: {
  track: Track;
  lyrics: Lyrics | null;
  lyricsLoading: boolean;
  onClose: () => void;
}) {
  const player = usePlayer();
  const library = useLibrary();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const liked = library.isLiked(track.videoId);

  const onHeaderDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > CLOSE_DISTANCE || info.velocity.y > CLOSE_VELOCITY) onClose();
  };

  const onCoverDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -TRACK_SWIPE) player.next();
    else if (info.offset.x > TRACK_SWIPE) player.prev();
  };

  const onSheetDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > SHEET_CLOSE_DISTANCE || info.velocity.y > CLOSE_VELOCITY) setSheet(null);
  };

  return (
    <div className="relative mx-auto flex h-full w-full max-w-md flex-col overflow-hidden px-6 pb-8 pt-2">
      {/* header doubles as the drag-to-close handle */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={onHeaderDragEnd}
        className="flex touch-none items-center justify-between pb-2"
      >
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground"
          onClick={onClose}
          aria-label="Close player"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
        <div className="min-w-0 px-2 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Playing from
          </div>
          <div className="truncate text-sm font-medium">{player.contextLabel || "Now playing"}</div>
        </div>
        <TrackMenu
          track={track}
          trigger={
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground"
              aria-label="More options"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          }
        />
      </motion.div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6">
        {/* cover: swipe left for next, right for previous */}
        <motion.div
          key={track.videoId}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.35}
          onDragEnd={onCoverDragEnd}
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
          className="mx-auto aspect-square w-full max-w-[340px] touch-pan-y overflow-hidden rounded-2xl bg-muted shadow-float"
        >
          <img src={track.thumb} alt={track.title} className="h-full w-full object-cover" draggable={false} />
        </motion.div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-2xl font-bold tracking-tight">{track.title}</div>
            <div className="truncate text-base text-muted-foreground">{track.artist}</div>
          </div>
          <button
            className={cx(
              "flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground",
              liked && "text-foreground"
            )}
            onClick={() => library.toggleLike(track)}
            aria-label={liked ? "Unlike" : "Like"}
          >
            <Heart className={cx("h-6 w-6", liked && "fill-current")} />
          </button>
          <DownloadButton track={track} className="h-10 w-10" />
        </div>

        <div>
          <Slider
            value={[player.position]}
            max={player.duration || 1}
            step={1}
            onValueChange={([v]) => player.seek(v)}
            aria-label="Seek"
          />
          <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>{formatDuration(player.position)}</span>
            <span>{formatDuration(player.duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            className={cx("flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground", player.shuffle && "text-foreground")}
            onClick={player.toggleShuffle}
            aria-label="Shuffle"
          >
            <Shuffle className="h-5 w-5" />
          </button>
          <button
            className="flex h-12 w-12 items-center justify-center rounded-full text-foreground"
            onClick={player.prev}
            aria-label="Previous"
          >
            <SkipBack className="h-7 w-7 fill-current" />
          </button>
          <button
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float active:scale-95"
            onClick={player.toggle}
            aria-label={player.isPlaying ? "Pause" : "Play"}
          >
            {player.isPlaying ? (
              <Pause className="h-7 w-7 fill-current" />
            ) : (
              <Play className="h-7 w-7 translate-x-[2px] fill-current" />
            )}
          </button>
          <button
            className="flex h-12 w-12 items-center justify-center rounded-full text-foreground"
            onClick={player.next}
            aria-label="Next"
          >
            <SkipForward className="h-7 w-7 fill-current" />
          </button>
          <button
            className={cx("flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground", player.repeat !== "off" && "text-foreground")}
            onClick={player.cycleRepeat}
            aria-label="Repeat"
          >
            {player.repeat === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
          </button>
        </div>

        <div className="flex items-center justify-center gap-10 text-sm text-muted-foreground">
          <button className="flex items-center gap-2 py-2" onClick={() => setSheet("lyrics")}>
            <MicVocal className="h-4 w-4" /> Lyrics
          </button>
          <button className="flex items-center gap-2 py-2" onClick={() => setSheet("queue")}>
            <ListMusic className="h-4 w-4" /> Up next
          </button>
        </div>
      </div>

      <AnimatePresence>
        {sheet && (
          <>
            <motion.div
              key="scrim"
              className="absolute inset-0 bg-black/40"
              onClick={() => setSheet(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              className="absolute inset-x-0 bottom-0 flex h-[72%] flex-col rounded-t-3xl border-t border-border bg-card/95 backdrop-blur-xl"
            >
              {/* grabber and tabs are the drag handle; the list itself scrolls */}
              <motion.div
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={onSheetDragEnd}
                className="touch-none"
              >
                <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted-foreground/40" aria-hidden />
                <div className="flex justify-center gap-1 p-3 text-sm">
                  {(["queue", "lyrics"] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => setSheet(key)}
                      className={cx(
                        "rounded-full px-4 py-1.5 font-semibold transition-colors",
                        sheet === key ? "bg-foreground text-background" : "text-muted-foreground"
                      )}
                    >
                      {key === "queue" ? "Up next" : "Lyrics"}
                    </button>
                  ))}
                </div>
              </motion.div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {sheet === "queue" ? (
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
