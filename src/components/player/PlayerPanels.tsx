"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePlayer } from "@/stores/player";
import { useTrackDuration } from "@/stores/durations";
import { EqBars } from "@/components/track/EqBars";
import { formatDuration, cx } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lyrics, Track } from "@/lib/types";
import { MicVocal } from "lucide-react";

/** Queue and lyrics panels, shared by the desktop and mobile now-playing screens. */

export function QueuePanel() {
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

export function LyricsPanel({
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
