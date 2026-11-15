"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { useSettings } from "@/stores/settings";
import { useLyrics, lineIndexAt, type LyricsState } from "@/lib/useLyrics";
import { MiniArt, CoverArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { RightResizer } from "@/components/RightResizer";
import { formatDuration } from "@/lib/format";
import type { LyricLine, Track } from "@/lib/types";

function Seek({ compact }: { compact?: boolean }) {
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
    <div className="seek" style={compact ? { maxWidth: "none" } : undefined}>
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

const EMPTY_LINES: LyricLine[] = [];

/** how long a manual scroll pauses auto-follow before it resumes (Spotify-like) */
const RESUME_MS = 3500;
/** scroll events within this window after our own scrollTo are ignored */
const PROG_MS = 900;

/**
 * Karaoke lyrics list. Holds its own follow state and is keyed by track id
 * in the parent, so every track starts with a fresh, auto-following view
 * without any reset effects. Manual scrolling pauses the follow briefly;
 * it resumes on its own after a few seconds or via the Sync button.
 */
function LyricsView({
  track,
  position,
  duration,
  onSeek,
}: {
  track: Track;
  position: number;
  duration: number;
  onSeek: (sec: number) => void;
}) {
  const lyrics: LyricsState = useLyrics(track, duration);
  const listRef = useRef<HTMLDivElement>(null);
  const autoRef = useRef(true);
  const progUntilRef = useRef(0);
  const idxRef = useRef(-2);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [auto, setAuto] = useState(true);
  // derived, not state — the lyrics cache keeps the lines array stable
  const lines = lyrics.status === "synced" ? lyrics.lines : EMPTY_LINES;

  const idx = lines.length ? lineIndexAt(lines, position) : -1;

  // scroll the active line into its anchor position (low in the view,
  // like a synced lyrics card); long jumps land instantly so they can
  // never be mistaken for the user scrolling
  const follow = (list: HTMLElement, el: HTMLElement, smooth: boolean) => {
    const top = el.offsetTop - list.clientHeight * 0.58 + el.offsetHeight / 2;
    progUntilRef.current = Date.now() + PROG_MS;
    list.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  };

  // active-line follow + karaoke fill
  useEffect(() => {
    const list = listRef.current;
    if (!list || !lines.length) return;
    const els = list.querySelectorAll<HTMLButtonElement>(".ly");
    if (idx !== idxRef.current) {
      idxRef.current = idx;
      els.forEach((el, i) => {
        el.classList.toggle("on", i === idx);
        el.classList.toggle("past", i < idx);
        const d = Math.min(3, Math.abs(i - idx));
        if (d > 0) el.dataset.d = String(d);
        else delete el.dataset.d;
        if (i !== idx) el.style.removeProperty("--lp");
      });
      const el = els[idx];
      if (el && autoRef.current) {
        const top = el.offsetTop - list.clientHeight * 0.58 + el.offsetHeight / 2;
        // big jumps (panel just opened, seek) snap into place; line-to-line
        // moves glide — and a glide this short always finishes inside PROG_MS
        const smooth = Math.abs(top - list.scrollTop) < 220;
        follow(list, el, smooth);
      }
    }
    const el = els[idx];
    if (el) {
      const a = lines[idx].t;
      const b = lines[idx + 1] ? lines[idx + 1].t : duration || a + 1;
      const lp = Math.max(0, Math.min(100, ((position - a) / Math.max(0.1, b - a)) * 100));
      el.style.setProperty("--lp", `${lp}%`);
    }
  }, [idx, lines, position, duration]);

  // manual scrolling pauses the follow — resume on its own a few seconds
  // after the last scroll, or instantly via the Sync button
  const pauseAuto = () => {
    if (resumeRef.current) clearTimeout(resumeRef.current);
    if (!autoRef.current) {
      resumeRef.current = setTimeout(resume, RESUME_MS);
      return;
    }
    autoRef.current = false;
    setAuto(false);
    resumeRef.current = setTimeout(resume, RESUME_MS);
  };

  const resume = () => {
    if (resumeRef.current) {
      clearTimeout(resumeRef.current);
      resumeRef.current = null;
    }
    if (autoRef.current) return;
    autoRef.current = true;
    setAuto(true);
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(".ly.on");
    if (list && el) follow(list, el, true);
  };

  // never leave a dangling resume timer behind
  useEffect(
    () => () => {
      if (resumeRef.current) clearTimeout(resumeRef.current);
    },
    [],
  );

  const synced = lyrics.status === "synced" && lines.length > 0;

  if (lyrics.status === "loading" || lyrics.status === "idle") {
    return (
      <div className="npp-list">
        <div className="lyempty">
          <b>Looking for lyrics…</b>
          Hang on a second.
        </div>
      </div>
    );
  }

  if (lyrics.status === "plain") {
    return (
      <div className="npp-list lyrics">
        <div className="lypad">
          {lyrics.text.split("\n").map((line, i) => (
            <span key={i} className="ly" style={{ cursor: "default" }}>
              <span className="fillx">{line || "♪"}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (lyrics.status === "none") {
    return (
      <div className="npp-list">
        <div className="lyempty">
          <b>No lyrics for this track yet</b>
          Lyrics are only shown when the lyrics source has a match.
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="npp-list lyrics"
        ref={listRef}
        onWheel={pauseAuto}
        onTouchMove={pauseAuto}
        onScroll={() => {
          // our own scrollTo fires scroll events too — ignore those
          if (Date.now() < progUntilRef.current) return;
          pauseAuto();
        }}
      >
        <div className="lypad">
          {synced &&
            lines.map((l, i) => (
              <button
                key={i}
                className="ly"
                data-i={i}
                onClick={() => {
                  onSeek(l.t);
                  resume();
                }}
              >
                <span className="fillx">{l.text || "♪"}</span>
              </button>
            ))}
        </div>
      </div>
      {synced && !auto && (
        <button
          className="syncbtn show"
          onClick={() => {
            resume();
          }}
        >
          <Icon name="mic" className="xs" /> Sync to song
        </button>
      )}
    </>
  );
}

/** slide-up now playing panel: Up next / Lyrics — mockup verbatim */
export function NowPlayingPanel() {
  const panel = useUi((s) => s.panel);
  const tab = useUi((s) => s.panelTab);
  const setPanelTab = useUi((s) => s.setPanelTab);
  const closePanel = useUi((s) => s.closePanel);
  const player = usePlayer();
  const lySize = useSettings((s) => s.lySize);
  const track = player.current() as Track | null;

  if (!panel) return null;

  const lm = tab === "lyrics";

  return (
    <section className={`npp open sz${lySize}${lm ? " lm" : ""}`} aria-label="Now playing">
      <RightResizer />
      <div className="npp-bg" aria-hidden="true" />
      <div className="npp-h">
        <button className="iconbtn" onClick={closePanel} aria-label="Close">
          <Icon name="chev-down" />
        </button>
        <div className="tabs tabs-top">
          <button className={!lm ? "on" : ""} onClick={() => setPanelTab("queue")}>
            Up next
          </button>
          <button className={lm ? "on" : ""} onClick={() => setPanelTab("lyrics")}>
            Lyrics
          </button>
        </div>
        <div className={`lyctl${lm ? " show" : ""}`}>
          <button
            className="iconbtn"
            aria-label="Smaller text"
            title="Smaller text"
            onClick={() => useSettings.getState().setLySize(Math.max(0, lySize - 1) as 0 | 1 | 2)}
          >
            <span className="aa">A−</span>
          </button>
          <button
            className="iconbtn"
            aria-label="Larger text"
            title="Larger text"
            onClick={() => useSettings.getState().setLySize(Math.min(2, lySize + 1) as 0 | 1 | 2)}
          >
            <span className="aa big">A+</span>
          </button>
        </div>
      </div>

      <div className="npp-body">
        <div className="npp-art">
          <CoverArt track={track} className="cov" hue={track ? undefined : 280} />
          <div className="npp-meta">
            <h2>{track?.title ?? ""}</h2>
            <div className="a">{track?.artist ?? ""}</div>
          </div>
        </div>

        <div className="npp-side">
          {!track ? (
            <div className="npp-list">
              <div className="lyempty">
                <b>Nothing playing</b>
                Pick a song to see its queue and lyrics.
              </div>
            </div>
          ) : !lm ? (
            <div className="npp-list">
              {player.queue.map((q, i) => (
                <div
                  key={`${q.videoId}-${i}`}
                  className={`qrow${i === player.index ? " on" : ""}`}
                  onClick={() => player.playFromQueue(i)}
                >
                  <MiniArt track={q} className="mini" />
                  <div className="grow">
                    <div className="title trunc">{q.title}</div>
                    <div className="sub trunc">{q.artist}</div>
                  </div>
                  <span className="tm">{formatDuration(q.duration ?? null)}</span>
                </div>
              ))}
            </div>
          ) : (
            <LyricsView
              key={track.videoId}
              track={track}
              position={player.position}
              duration={player.duration || track.duration || 0}
              onSeek={(sec) => player.seek(sec)}
            />
          )}
        </div>
      </div>

      <div className="npp-foot">
        <Seek compact />
        <div className="btns">
          <button className="iconbtn" onClick={() => player.prev()} aria-label="Previous">
            <Icon name="prev" fill />
          </button>
          <button className="playbtn" onClick={() => player.toggle()} aria-label="Play / pause">
            <Icon name={player.isPlaying ? "pause" : "play"} />
          </button>
          <button className="iconbtn" onClick={() => player.next()} aria-label="Next">
            <Icon name="next" fill />
          </button>
        </div>
      </div>
    </section>
  );
}
