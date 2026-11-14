"use client";

import { memo } from "react";
import type { Track } from "@/lib/types";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { formatDuration, cx } from "@/lib/format";
import { useTrackDuration } from "@/stores/durations";
import { Heart, MoreHorizontal, Pause, Play } from "lucide-react";
import { TrackMenu } from "./TrackMenu";
import { EqBars } from "./EqBars";

export const TrackRow = memo(function TrackRow({
  track,
  index,
  queueIndex,
  showIndex,
  list,
  onRemoveFromList,
}: {
  track: Track;
  index?: number;
  queueIndex?: number;
  showIndex?: boolean;
  list?: Track[];
  onRemoveFromList?: () => void;
}) {
  const player = usePlayer();
  const library = useLibrary();
  const ui = useUi();
  const current = player.current();
  const isCurrent = current?.videoId === track.videoId;
  const isPlaying = isCurrent && player.isPlaying;
  const liked = library.isLiked(track.videoId);
  const duration = useTrackDuration(track);

  const play = () => {
    if (isCurrent) {
      player.toggle();
      return;
    }
    if (queueIndex !== undefined && player.queue[queueIndex]?.videoId === track.videoId) {
      player.playFromQueue(queueIndex);
      return;
    }
    if (list && list.length) {
      const idx = Math.max(0, list.findIndex((t) => t.videoId === track.videoId));
      player.playQueue(list, idx);
    } else {
      player.playTrack(track);
    }
  };

  return (
    <div
      className={cx(
        "group grid grid-cols-[2.5rem_1fr_auto] cursor-pointer select-none items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors duration-200 hover:bg-card md:grid-cols-[2.5rem_minmax(0,3fr)_minmax(0,2fr)_auto_auto]",
        isCurrent ? "bg-card" : "hover:bg-card/70"
      )}
      onClick={play}
      role="button"
      aria-label={`Play ${track.title}`}
    >
      <div className="flex w-10 items-center justify-center tabular-nums text-muted-foreground">
        {isPlaying ? (
          <EqBars playing className="text-foreground" />
        ) : isCurrent ? (
          <Pause className="h-4 w-4" />
        ) : (
          <>
            <span
              className={cx(
                "group-hover:hidden",
                showIndex ? "" : "hidden md:inline"
              )}
            >
              {showIndex && index !== undefined ? index + 1 : ""}
            </span>
            <Play className="hidden h-4 w-4 fill-current group-hover:block" />
          </>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={track.thumb}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-md object-cover bg-muted"
        />
        <div className="min-w-0">
          <div className={cx("truncate font-medium", isCurrent && "text-foreground")}>
            {track.title}
          </div>
          <button
            className="max-w-full truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              if (track.artistId)
                ui.navigate({ name: "artist", id: track.artistId, label: track.artist });
            }}
          >
            {track.artist}
          </button>
        </div>
      </div>
      <div className="hidden truncate text-xs text-muted-foreground md:block">
        {track.views || track.album || ""}
      </div>
      <button
        className={cx(
          "hidden h-8 w-8 items-center justify-center rounded-full transition-all duration-200 hover:bg-accent md:flex",
          liked ? "text-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100"
        )}
        aria-label={liked ? "Unlike" : "Like"}
        onClick={(e) => {
          e.stopPropagation();
          library.toggleLike(track);
        }}
      >
        <Heart className={cx("h-4 w-4 transition-transform active:scale-125", liked && "fill-current")} />
      </button>
      <div className="flex items-center gap-1">
        <span className="hidden w-10 text-right text-xs tabular-nums text-muted-foreground sm:inline">
          {formatDuration(duration)}
        </span>
        <TrackMenu
          track={track}
          queueIndex={queueIndex}
          onRemoveFromList={onRemoveFromList}
          trigger={
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Track options"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        />
      </div>
    </div>
  );
});
