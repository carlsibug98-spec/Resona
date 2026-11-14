"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { useSettings } from "@/stores/settings";
import { useLyrics, lineIndexAt } from "@/lib/useLyrics";
import { CoverArt, MiniArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { formatDuration } from "@/lib/format";
import { toast } from "@/stores/toast";
import type { Track } from "@/lib/types";

/** full-screen now playing: art / lyrics / video modes + credits + queue card */
export function NowFull() {
  const open = useUi((s) => s.fullPlayer);
  const nfMode = useUi((s) => s.nfMode);
  const setNfMode = useUi((s) => s.setNfMode);
  const setFullPlayer = useUi((s) => s.setFullPlayer);
  const player = usePlayer();
  const showVideo = useSettings((s) => s.showVideo);
  const track = player.current() as Track | null;
  const lyrics = useLyrics(track, player.duration || track?.duration);

  const lines = useMemo(
    () => (lyrics.status === "synced" ? lyrics.lines : []),
    [lyrics]
  );
  const idx = lines.length ? lineIndexAt(lines, player.position) : -1;
  const listRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef(-2);

  useEffect(() => {
    idxRef.current = -2;
  }, [track?.videoId]);

  // follow the active line
  useEffect(() => {
    if (!open || nfMode !== "lyrics" || !lines.length) return;
    const box = listRef.current;
    if (!box) return;
    const els = box.querySelectorAll<HTMLElement>(".nf-ly");
    if (idx !== idxRef.current) {
      idxRef.current = idx;
      els.forEach((el, i) => {
        el.classList.toggle("on", i === idx);
        el.classList.toggle("past", i < idx);
      });
      const el = els[idx];
      if (el)
        box.scrollTo({
          top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2,
          behavior: "smooth",
        });
    }
  }, [idx, open, nfMode, lines]);

  if (!open) return null;

  const next = player.queue[player.index + 1] as Track | undefined;
  const toggleMode = (k: "lyrics" | "video") => setNfMode(nfMode === k ? null : k);

  return (
    <section
      className={`nowfull open${nfMode === "lyrics" ? " nfm-lyrics" : ""}${nfMode === "video" ? " nfm-video" : ""}`}
      aria-label="Now playing, full screen"
    >
      <header className="nf-top">
        <span className="nf-title trunc">{track ? track.title : "Now playing"}</span>
        <button
          className="nf-tb"
          aria-pressed={nfMode === "lyrics"}
          aria-label="Lyrics"
          title="Lyrics"
          onClick={() => toggleMode("lyrics")}
        >
          <Icon name="mic" />
        </button>
        <button
          className="nf-tb"
          aria-pressed={nfMode === "video"}
          aria-label="Video"
          title="Video"
          onClick={() => toggleMode("video")}
        >
          <Icon name="video" />
        </button>
        <button
          className="nf-tb"
          aria-label="Credits"
          title="Credits"
          onClick={() =>
            document.getElementById("nfCredits")?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        >
          <Icon name="people" />
        </button>
        <button className="nf-tb" aria-label="Close full screen" title="Close" onClick={() => setFullPlayer(false)}>
          <Icon name="chev-down" />
        </button>
      </header>

      <div className="nf-body">
        <div className="nf-hero">
          <CoverArt track={track} className="nf-art" hue={track ? undefined : 0} />
          {nfMode === "video" && !showVideo && (
            <div className="nf-video">
              Music video preview
              <br />
              <span style={{ fontSize: 12, marginTop: 8, display: "block" }}>
                Enable “Show video” in Settings → Playback to watch the real video here.
              </span>
            </div>
          )}
          {nfMode === "lyrics" && (
            <div className="nf-lyrics" ref={listRef}>
              {lines.length ? (
                lines.map((l, i) => (
                  <button
                    key={i}
                    className="nf-ly"
                    onClick={() => {
                      player.seek(l.t);
                      idxRef.current = -2;
                    }}
                  >
                    {l.text || "♪"}
                  </button>
                ))
              ) : (
                <p className="nf-muted">
                  {lyrics.status === "loading" ? "Looking for lyrics…" : "No lyrics for this track yet."}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="nf-meta">
          <h1 className="trunc">{track ? track.title : "Nothing playing"}</h1>
          <div className="nf-a trunc">{track ? track.artist : "Pick a track to start"}</div>
        </div>

        <div className="nf-cards">
          <section className="nf-card" id="nfCredits">
            <header>
              <h2>Credits</h2>
            </header>
            {track ? (
              <>
                <div className="nf-person">
                  <b>{track.artist}</b>
                  <span>Main artist</span>
                </div>
                <div className="nf-person">
                  <b>{track.album || "Single"}</b>
                  <span>Album</span>
                </div>
                <div className="nf-person">
                  <b>YouTube Music</b>
                  <span>Source{track.views ? ` · ${track.views} plays` : ""}</span>
                </div>
              </>
            ) : (
              <p className="nf-muted">Nothing playing.</p>
            )}
          </section>
          <section className="nf-card">
            <header>
              <h2>Next in queue</h2>
            </header>
            {next ? (
              <div className="nf-q">
                <MiniArt track={next} className="mini" />
                <div style={{ minWidth: 0 }}>
                  <b className="trunc">{next.title}</b>
                  <span className="trunc">{next.artist}</span>
                </div>
              </div>
            ) : (
              <p className="nf-muted">Nothing queued after this.</p>
            )}
          </section>
        </div>
      </div>

      <footer className="nf-player">
        <div className="nf-np">
          <MiniArt track={track} className="mini" />
          <div className="nf-npmeta">
            <b className="trunc">{track?.title ?? ""}</b>
            <span className="trunc">{track?.artist ?? ""}</span>
          </div>
        </div>
        <div className="nf-ctrl">
          <div className="nf-btns">
            <button
              className="nf-tb"
              onClick={() => {
                player.toggleShuffle();
                toast(player.shuffle ? "Shuffle on" : "Shuffle off");
              }}
              aria-label="Shuffle"
            >
              <Icon name="shuffle" />
            </button>
            <button className="nf-tb" onClick={() => player.prev()} aria-label="Previous">
              <Icon name="prev" fill />
            </button>
            <button className="nf-play" onClick={() => player.toggle()} aria-label="Play / pause">
              <Icon name={player.isPlaying ? "pause" : "play"} fill />
            </button>
            <button className="nf-tb" onClick={() => player.next()} aria-label="Next">
              <Icon name="next" fill />
            </button>
            <button
              className="nf-tb"
              onClick={() => player.cycleRepeat()}
              aria-label="Repeat"
              style={player.repeat !== "off" ? { color: "var(--brand2)" } : undefined}
            >
              <Icon name="repeat" />
            </button>
          </div>
          <div className="nf-seek">
            <span>{formatDuration(player.position)}</span>
            <div
              className="nf-bar"
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(player.duration)}
              aria-valuenow={Math.round(player.position)}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                if (player.duration) player.seek(frac * player.duration);
              }}
            >
              <div
                className="nf-fill"
                style={{ width: player.duration ? `${(player.position / player.duration) * 100}%` : "0" }}
              />
            </div>
            <span>{formatDuration(player.duration)}</span>
          </div>
        </div>
        <div className="nf-rt" />
      </footer>
    </section>
  );
}
