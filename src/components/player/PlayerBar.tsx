"use client";

import { motion } from "framer-motion";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { formatDuration, cx } from "@/lib/format";
import {
  Heart,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function PlayerBar() {
  const player = usePlayer();
  const library = useLibrary();
  const ui = useUi();
  const track = player.current();
  if (!track) return null;

  const liked = library.isLiked(track.videoId);
  const progress = player.duration > 0 ? (player.position / player.duration) * 100 : 0;

  return (
    <motion.div
      initial={{ y: 96, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", bounce: 0.2, duration: 0.7 }}
      className="fixed inset-x-0 bottom-0 z-30 px-2 pb-2 md:px-0 md:pb-0"
    >
      {/* mobile progress line */}
      <div className="mx-auto h-0.5 w-full max-w-screen-2xl overflow-hidden rounded-full bg-white/10 md:hidden">
        <div className="h-full rounded-full bg-foreground/80" style={{ width: `${progress}%` }} />
      </div>
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 rounded-2xl border border-border bg-card/85 px-3 shadow-float backdrop-blur-2xl md:h-[72px] md:max-w-none md:rounded-none md:border-0 md:bg-black md:px-4 md:shadow-none md:backdrop-blur-none">
        {/* track info */}
        <button
          className="group flex min-w-0 flex-1 items-center gap-3 text-left md:flex-none md:w-72"
          onClick={() => ui.setFullPlayer(true)}
          aria-label="Open full player"
        >
          <img
            src={track.thumb}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg object-cover bg-muted shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium group-hover:underline">{track.title}</div>
            <div className="truncate text-xs text-muted-foreground">{track.artist}</div>
          </div>
        </button>

        {/* controls — center on desktop */}
        <div className="hidden flex-1 flex-col items-center gap-1.5 md:flex">
          <div className="flex items-center gap-1">
            <button
              className={cx(
                "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                player.shuffle && "text-foreground"
              )}
              onClick={player.toggleShuffle}
              aria-label="Shuffle"
            >
              <Shuffle className={cx("h-4 w-4", player.shuffle && "drop-shadow-[0_0_1px_rgba(255,255,255,0.6)]")} />
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              onClick={player.prev}
              aria-label="Previous"
            >
              <SkipBack className="h-[18px] w-[18px] fill-current" />
            </button>
            <motion.button
              whileTap={{ scale: 0.86 }}
              whileHover={{ scale: 1.06 }}
              transition={{ type: "spring", bounce: 0.5 }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float"
              onClick={player.toggle}
              aria-label={player.isPlaying ? "Pause" : "Play"}
            >
              {player.isPlaying ? (
                <Pause className="h-[18px] w-[18px] fill-current" />
              ) : (
                <Play className="h-[18px] w-[18px] translate-x-[1px] fill-current" />
              )}
            </motion.button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              onClick={player.next}
              aria-label="Next"
            >
              <SkipForward className="h-[18px] w-[18px] fill-current" />
            </button>
            <button
              className={cx(
                "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                player.repeat !== "off" && "text-foreground"
              )}
              onClick={player.cycleRepeat}
              aria-label="Repeat"
            >
              {player.repeat === "one" ? (
                <Repeat1 className={cx("h-4 w-4", "drop-shadow-[0_0_1px_rgba(255,255,255,0.6)]")} />
              ) : (
                <Repeat className={cx("h-4 w-4", player.repeat !== "off" && "drop-shadow-[0_0_1px_rgba(255,255,255,0.6)]")} />
              )}
            </button>
          </div>
          <div className="group flex w-full max-w-xl items-center gap-2">
            <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">
              {formatDuration(player.position)}
            </span>
            <Slider
              value={[player.position]}
              max={player.duration || 1}
              step={1}
              onValueChange={([v]) => player.seek(v)}
              className="flex-1"
              aria-label="Seek"
            />
            <span className="w-10 text-[10px] tabular-nums text-muted-foreground">
              {formatDuration(player.duration)}
            </span>
          </div>
        </div>

        {/* mobile mini controls */}
        <div className="flex items-center gap-1 md:hidden">
          <motion.button
            whileTap={{ scale: 0.86 }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
            onClick={player.toggle}
            aria-label={player.isPlaying ? "Pause" : "Play"}
          >
            {player.isPlaying ? (
              <Pause className="h-[18px] w-[18px] fill-current" />
            ) : (
              <Play className="h-[18px] w-[18px] translate-x-[1px] fill-current" />
            )}
          </motion.button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground"
            onClick={player.next}
            aria-label="Next"
          >
            <SkipForward className="h-5 w-5 fill-current" />
          </button>
        </div>

        {/* right side */}
        <div className="hidden items-center justify-end gap-0.5 md:flex md:w-72">
          <motion.button
            whileTap={{ scale: 1.3 }}
            transition={{ type: "spring", bounce: 0.6 }}
            className={cx(
              "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
              liked && "text-foreground"
            )}
            onClick={() => library.toggleLike(track)}
            aria-label="Like"
          >
            <Heart className={cx("h-4 w-4", liked && "fill-current")} />
          </motion.button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => ui.setFullPlayer(true)}
            aria-label="Queue"
          >
            <ListMusic className="h-4 w-4" />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            onClick={player.toggleMute}
            aria-label="Mute"
          >
            {player.muted || player.volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : player.volume < 0.5 ? (
              <Volume1 className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <Slider
            value={[player.muted ? 0 : player.volume * 100]}
            max={100}
            step={1}
            onValueChange={([v]) => player.setVolume(v / 100)}
            className="w-24"
            aria-label="Volume"
          />
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => ui.setFullPlayer(true)}
            aria-label="Expand player"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
