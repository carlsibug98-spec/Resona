"use client";

import { useRef } from "react";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { useDownloadProgress } from "@/stores/download-progress";
import { useUi } from "@/stores/ui";
import { Icon } from "@/components/Icon";
import { DlButton } from "@/components/track/DlButton";
import { MiniArt } from "@/lib/art";
import { graduate, markStep } from "@/lib/onboarding";
import { formatDuration } from "@/lib/format";
import { toast } from "@/stores/toast";
import type { Track } from "@/lib/types";

function SeekBar() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const ref = useRef<HTMLDivElement>(null);

  const onSeek = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    seek(frac * duration);
  };

  return (
    <div className="seek">
      <span>{formatDuration(position)}</span>
      <div
        className="bar"
        ref={ref}
        onClick={onSeek}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
      >
        <div className="fill" style={{ width: duration ? `${(position / duration) * 100}%` : "0" }} />
      </div>
      <span>{formatDuration(duration)}</span>
    </div>
  );
}

export function PlayerBar() {
  const player = usePlayer();
  const ui = useUi();
  const track = player.current() as Track | null;
  const liked = useLibrary((s) => (track ? !!s.liked[track.videoId] : false));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const active = useDownloadProgress((s) => (track ? s.active[track.videoId] : undefined));
  const saved = useLibrary((s) => (track ? !!s.downloads[track.videoId]?.complete : false));

  const toggleLikeCurrent = () => {
    if (!track) return toast("Play something first");
    toggleLike(track);
    graduate();
    if (!liked) markStep("like");
  };

  return (
    <footer className="player">
      <div className="np">
        <button
          className={`mini np-art${track ? " has" : ""}`}
          onClick={() => ui.openPanel("queue")}
          aria-label="Open now playing"
        >
          <MiniArt track={track} className="mini-inner" />
        </button>
        <div className="meta">
          <b className="trunc">{track ? track.title : "Nothing playing"}</b>
          <span className="trunc">{track ? track.artist : "Pick a track to start"}</span>
        </div>
        <button
          className="iconbtn"
          onClick={toggleLikeCurrent}
          aria-label={liked ? "Unlike" : "Like"}
          style={liked ? { color: "var(--brand2)" } : undefined}
        >
          <Icon name="heart" fill={liked} />
        </button>
      </div>

      <div className="ctrl">
        <div className="btns">
          <button
            className={`iconbtn${player.shuffle ? " on" : ""}`}
            onClick={() => {
              player.toggleShuffle();
              toast(player.shuffle ? "Shuffle on" : "Shuffle off");
            }}
            aria-label="Shuffle"
          >
            <Icon name="shuffle" />
          </button>
          <button className="iconbtn keep" onClick={() => player.prev()} aria-label="Previous">
            <Icon name="prev" fill />
          </button>
          <button
            className="playbtn"
            onClick={() => player.toggle()}
            aria-label={player.isPlaying ? "Pause" : "Play"}
          >
            <Icon name={player.isPlaying ? "pause" : "play"} className={player.isPlaying ? "pause" : ""} />
          </button>
          <button className="iconbtn keep" onClick={() => player.next()} aria-label="Next">
            <Icon name="next" fill />
          </button>
          <button
            className={`iconbtn${player.repeat !== "off" ? " on" : ""}`}
            onClick={() => {
              player.cycleRepeat();
              const mode = usePlayer.getState().repeat;
              toast(mode === "all" ? "Repeat: all" : mode === "one" ? "Repeat: one" : "Repeat off");
            }}
            aria-label="Repeat"
            title={player.repeat === "one" ? "Repeat one" : player.repeat === "all" ? "Repeat all" : "Repeat off"}
          >
            <Icon name="repeat" />
          </button>
        </div>
        <SeekBar />
      </div>

      <div className="pr">
        {track && active !== undefined && (
          <span className="dlstate">{active >= 0 ? `Saving ${Math.round(active * 100)}%` : "Saving…"}</span>
        )}
        {track && !active && saved && <span className="dlstate ok">Offline</span>}
        <button
          className="iconbtn"
          onClick={() => ui.setFullPlayer(true)}
          aria-label="Full screen now playing"
          title="Full screen"
        >
          <Icon name="expand" />
        </button>
        {track && <DlButton track={track} />}
        <button
          className={`iconbtn${ui.fullPlayer ? " on" : ""}`}
          onClick={() => {
            ui.closePanel();
            ui.setFullPlayer(true);
            ui.setNfMode("lyrics");
          }}
          aria-label="Lyrics"
          title="Lyrics"
        >
          <Icon name="mic" />
        </button>
        <button
          className={`iconbtn${ui.queueDrawer ? " on" : ""}`}
          onClick={() => ui.toggleQueueDrawer()}
          aria-label="Queue"
          title="Queue"
        >
          <Icon name="queue" />
        </button>
      </div>
    </footer>
  );
}
