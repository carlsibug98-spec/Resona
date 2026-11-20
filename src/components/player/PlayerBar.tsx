"use client";

import { useEffect, useRef, useState } from "react";
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
  const [dragging, setDragging] = useState(false);
  /** hover position as a 0-1 fraction of the bar (null = not hovering) */
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);

  const fracFromEvent = (e: React.PointerEvent<HTMLDivElement>): number => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    seek(fracFromEvent(e) * duration);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const frac = fracFromEvent(e);
    setHoverFrac(frac);
    if (dragging && duration) seek(frac * duration);
  };
  const onPointerUp = () => setDragging(false);

  const pct = duration ? (position / duration) * 100 : 0;
  const tipFrac = hoverFrac ?? 0;

  return (
    <div className="seek">
      <span>{formatDuration(position)}</span>
      <div className="bar-wrap" style={{ flex: 1, position: "relative" }}>
        <div
          className={`bar${dragging ? " dragging" : ""}`}
          ref={ref}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHoverFrac(null)}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
        >
          <div className="fill" style={{ width: `${pct}%` }} />
          <div className="knob" style={{ left: `${pct}%` }} />
        </div>
        {hoverFrac !== null && duration > 0 && (
          <span className="seek-tip" style={{ left: `${tipFrac * 100}%` }}>
            {formatDuration(tipFrac * duration)}
          </span>
        )}
      </div>
      <span>{formatDuration(duration)}</span>
    </div>
  );
}

function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  return (
    <div className="vol">
      <button
        className="iconbtn"
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        data-tip={muted ? "Unmute" : "Mute"}
      >
        <Icon name={muted || volume === 0 ? "vol-x" : volume < 0.5 ? "vol-low" : "vol"} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Volume"
      />
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
          <b className="trunc" title={track ? track.title : undefined}>{track ? track.title : "Nothing playing"}</b>
          <span className="trunc" title={track ? track.artist : undefined}>{track ? track.artist : "Pick a track to start"}</span>
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
              // read the state AFTER the toggle — the render-time snapshot
              // still holds the pre-toggle value and announced the opposite
              const s = usePlayer.getState();
              s.toggleShuffle();
              toast(s.shuffle ? "Shuffle on" : "Shuffle off");
            }}
            aria-label="Shuffle" data-tip="Shuffle"
          >
            <Icon name="shuffle" />
          </button>
          <button className="iconbtn keep" onClick={() => player.prev()} aria-label="Previous" data-tip="Previous">
            <Icon name="prev" fill />
          </button>
          <button
            className={`playbtn${player.buffering && !player.isPlaying ? " loading" : ""}`}
            onClick={() => player.toggle()}
            aria-label={player.isPlaying ? "Pause" : "Play"} data-tip={player.isPlaying ? "Pause" : "Play"}
          >
            <Icon name={player.isPlaying ? "pause" : "play"} className={player.isPlaying ? "pause" : ""} />
          </button>
          <button className="iconbtn keep" onClick={() => player.next()} aria-label="Next" data-tip="Next">
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
            data-tip={player.repeat === "one" ? "Repeat one" : player.repeat === "all" ? "Repeat all" : "Repeat off"}
          >
            <Icon name="repeat" />
          </button>
        </div>
        <SeekBar />
      </div>

      <div className="pr">
        <div className="hide-sm"><VolumeControl /></div>
        {track && active !== undefined && (
          <span className="dlstate">{active >= 0 ? `Saving ${Math.round(active * 100)}%` : "Saving…"}</span>
        )}
        {track && !active && saved && <span className="dlstate ok">Offline</span>}
        <button
          className="iconbtn"
          onClick={() => ui.setFullPlayer(true)}
          aria-label="Full screen now playing"
          data-tip="Full screen"
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
          data-tip="Lyrics"
        >
          <Icon name="mic" />
        </button>
        <button
          className={`iconbtn${ui.panel ? " on" : ""}`}
          onClick={() => ui.togglePanel()}
          aria-label={ui.panel ? "Hide Now Playing view" : "Show Now Playing view"}
          data-tip={ui.panel ? "Hide Now Playing view" : "Show Now Playing view"}
        >
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
          </svg>
        </button>
        <button
          className={`iconbtn${ui.queueDrawer ? " on" : ""}`}
          onClick={() => ui.toggleQueueDrawer()}
          aria-label="Queue"
          data-tip="Queue"
        >
          <Icon name="queue" />
        </button>
      </div>
    </footer>
  );
}
