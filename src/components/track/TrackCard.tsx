"use client";

import { memo } from "react";
import type { Track } from "@/lib/types";
import { usePlayer } from "@/stores/player";
import { useTrackDuration } from "@/stores/durations";
import { formatDuration } from "@/lib/format";
import { Play } from "lucide-react";
import { TrackMenu } from "./TrackMenu";
import { MoreHorizontal } from "lucide-react";
import { EqBars } from "./EqBars";
import { cn } from "@/lib/utils";

export const TrackCard = memo(function TrackCard({
  track,
  list,
}: {
  track: Track;
  list?: Track[];
}) {
  const player = usePlayer();
  const isCurrent = player.current()?.videoId === track.videoId;
  const isPlaying = isCurrent && player.isPlaying;
  const duration = useTrackDuration(track);

  const play = () => {
    if (list && list.length) {
      const idx = Math.max(0, list.findIndex((t) => t.videoId === track.videoId));
      player.playQueue(list, idx);
    } else {
      player.playTrack(track);
    }
  };

  return (
    <div className="group relative w-36 shrink-0 rounded-2xl p-2.5 transition-colors duration-300 hover:bg-card sm:w-44">
      <button
        className="block w-full text-left"
        onClick={play}
        aria-label={`Play ${track.title}`}
      >
        <div className="relative aspect-square overflow-hidden rounded-xl bg-muted shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
          <img
            src={track.thumb}
            alt={track.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {duration ? (
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
              {formatDuration(duration)}
            </span>
          ) : null}
          {/* play / equalizer bubble */}
          <span
            className={cn(
              "absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-float transition-all duration-300",
              isPlaying
                ? "translate-y-0 opacity-100"
                : "group-hover:translate-y-0 group-hover:opacity-100"
            )}
          >
            {isPlaying ? (
              <EqBars playing className="h-3.5 text-primary-foreground" />
            ) : (
              <Play className="h-[18px] w-[18px] translate-x-[1px] fill-current" />
            )}
          </span>
        </div>
        <div className="mt-2.5">
          <div className={cn("truncate text-sm font-medium", isCurrent && "text-foreground")}>
            {track.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">{track.artist}</div>
        </div>
      </button>

      <div className="absolute right-3.5 top-3.5 opacity-0 transition-opacity group-hover:opacity-100">
        <TrackMenu
          track={track}
          trigger={
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/85"
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

export function TrackCardRow({ tracks }: { tracks: Track[] }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 no-scrollbar">
      {tracks.map((t) => (
        <TrackCard key={t.videoId} track={t} list={tracks} />
      ))}
    </div>
  );
}
