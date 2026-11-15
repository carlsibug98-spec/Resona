"use client";

import { useDurations } from "@/stores/durations";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { Icon } from "@/components/Icon";
import { DlButton } from "@/components/track/DlButton";
import { MiniArt, grad } from "@/lib/art";
import { formatDuration } from "@/lib/format";
import type { Track } from "@/lib/types";

/** column header of the track table — mockup verbatim */
export function TrackTableHead() {
  return (
    <div className="thead" aria-hidden="true">
      <div>#</div>
      <div>Title</div>
      <div>Artist</div>
      <div>Like</div>
      <div>Save</div>
      <div>Time</div>
      <div></div>
    </div>
  );
}

function Eq() {
  return (
    <span className="eq" aria-label="Playing">
      <i></i>
      <i></i>
      <i></i>
    </span>
  );
}

export interface TrackRowProps {
  track: Track;
  index: number;
  /** ids played when this row is clicked — the shelf/playlist context */
  list?: Track[];
  contextLabel?: string;
  hideIndex?: boolean;
}

/**
 * Mockup track row: number → play on hover, art + title, artist column,
 * like, download ring, duration, ⋯ menu. The grid columns come straight
 * from the mockup CSS (hidden columns collapse on mobile).
 */
export function TrackRow({ track, index, list, contextLabel }: TrackRowProps) {
  const player = usePlayer();
  const liked = useLibrary((s) => !!s.liked[track.videoId]);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const cached = useDurations((s) => s.map[track.videoId]);
  const dur = track.duration && track.duration > 0 ? track.duration : cached;

  const isCurrent = player.current()?.videoId === track.videoId;
  const playing = isCurrent && player.isPlaying;

  const play = () => {
    if (isCurrent) {
      player.toggle();
      return;
    }
    const queue = list && list.length ? list : [track];
    const start = list && list.length ? Math.max(0, list.findIndex((t) => t.videoId === track.videoId)) : 0;
    player.playQueue(queue, start, contextLabel || "");
  };

  return (
    <div className={`trow${playing ? " playing" : ""}`}>
      <div className="n">
        <span className="num">{playing ? <Eq /> : index + 1}</span>
        <span className="pb">
          <button onClick={play} aria-label={`Play ${track.title}`}>
            <Icon name={playing ? "pause" : "play"} fill />
          </button>
        </span>
      </div>
      <div className="who">
        <MiniArt track={track} className="mini" />
        <div className="grow">
          <div className="title trunc">{track.title}</div>
          <div className="artist trunc sub">{track.artist}</div>
        </div>
      </div>
      <div className="artistcol trunc muted">{track.artist}</div>
      <div className="likecol">
        <button
          className={`like${liked ? " on" : ""}`}
          aria-label={liked ? "Unlike" : "Like"}
          onClick={() => toggleLike(track)}
        >
          <Icon name="heart" fill={liked} />
        </button>
      </div>
      <DlButton track={track} />
      <div className="dur">{formatDuration(dur ?? null)}</div>
      <button
        className="more"
        aria-label="More options"
        onClick={() => useUi.getState().openModal({ kind: "trackMenu", track })}
      >
        <Icon name="more" />
      </button>
    </div>
  );
}

/** wide letter cover used by virtual mixes on the home shelf */
export function MixCover({ hue, letter }: { hue: number; letter: string }) {
  return (
    <div className="cov" style={{ background: grad(hue) }}>
      <span>{letter}</span>
    </div>
  );
}

