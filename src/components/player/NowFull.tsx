"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { useLyrics, lineIndexAt } from "@/lib/useLyrics";
import { useCredits } from "@/lib/useCredits";
import { CoverArt, MiniArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { formatDuration } from "@/lib/format";
import { toast } from "@/stores/toast";
import type { Track } from "@/lib/types";

/**
 * Full-screen now playing — markup mirrors the mockup 1:1 (art / lyrics
 * modes, credits + next-in-queue cards, player bar). Credits come from
 * MusicBrainz. v1.7.4: the video mode is gone — full-screen is audio +
 * lyrics only.
 */
export function NowFull() {
  const open = useUi((s) => s.fullPlayer);
  const nfMode = useUi((s) => s.nfMode);
  const setNfMode = useUi((s) => s.setNfMode);
  const setFullPlayer = useUi((s) => s.setFullPlayer);
  const player = usePlayer();
  const track = player.current() as Track | null;
  const lyrics = useLyrics(track, player.duration || track?.duration);
  const credits = useCredits(track);

  const lines = useMemo(
    () => (lyrics.status === "synced" ? lyrics.lines : []),
    [lyrics]
  );
  const idx = lines.length ? lineIndexAt(lines, player.position) : -1;
  const listRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef(-2);

  // new song (or fresh lyrics pane) → re-highlight from scratch
  useEffect(() => {
    idxRef.current = -2;
  }, [track?.videoId, nfMode]);

  // follow the active line (mockup nfTick)
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
  const toggleMode = (k: "lyrics") => setNfMode(nfMode === k ? null : k);

  // credits: MusicBrainz first, honest fallback keeps the card alive
  const creditPersons: { name: string; role: string }[] =
    credits.status === "ok" && credits.persons.length
      ? [
          ...credits.persons,
          ...(credits.album
            ? [
                {
                  name: credits.album,
                  role: `Album${credits.year ? ` · ${credits.year}` : ""}`,
                },
              ]
            : []),
        ]
      : track
        ? [
            { name: track.artist, role: "Main artist" },
            { name: track.album || "Single", role: "Album" },
            {
              name: "YouTube Music",
              role: `Source${track.views ? ` · ${track.views}` : ""}`,
            },
          ]
        : [];

  return (
    <section
      className={`nowfull open${nfMode === "lyrics" ? " nfm-lyrics" : ""}`}
      aria-label="Now playing, full screen"
    >
      <header className="nf-top">
        <span className="nf-title trunc" title={track ? track.title : undefined}>{track ? track.title : "Now playing"}</span>
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
          aria-label="Credits"
          title="Credits"
          onClick={() =>
            document
              .getElementById("nfCredits")
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        >
          <Icon name="people" />
        </button>
        <button
          className="nf-tb"
          aria-label="Close full screen"
          title="Close"
          onClick={() => {
            setFullPlayer(false);
            setNfMode(null);
          }}
        >
          <Icon name="chev-down" />
        </button>
      </header>

      <div className="nf-body">
        <div className="nf-hero">
          <CoverArt track={track} className="nf-art" hue={track ? undefined : 0} />
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
                {lyrics.status === "loading"
                  ? "Looking for lyrics…"
                  : "No lyrics for this track yet."}
              </p>
            )}
          </div>
        </div>

        <div className="nf-meta">
          <h1 className="trunc" title={track ? track.title : undefined}>{track ? track.title : "Nothing playing"}</h1>
          <div className="nf-a trunc" title={track ? track.artist : undefined}>{track ? track.artist : "Pick a track to start"}</div>
        </div>

        <div className="nf-cards">
          <section className="nf-card" id="nfCredits">
            <header>
              <h2>Credits</h2>
            </header>
            {track ? (
              <>
                {credits.status === "loading" && (
                  <p className="nf-muted">Looking up credits…</p>
                )}
                {creditPersons.map((p) => (
                  <div className="nf-person" key={`${p.name}-${p.role}`}>
                    <b>{p.name}</b>
                    <span>{p.role}</span>
                  </div>
                ))}
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
              <p className="nf-muted">
                {player.queue.length ? "Nothing queued after this." : "Nothing playing."}
              </p>
            )}
          </section>
        </div>
      </div>

      <footer className="nf-player">
        <div className="nf-np">
          <MiniArt track={track} className="mini" />
          <div className="nf-npmeta">
            <b className="trunc" title={track?.title}>{track?.title ?? ""}</b>
            <span className="trunc" title={track?.artist}>{track?.artist ?? ""}</span>
          </div>
        </div>
        <div className="nf-ctrl">
          <div className="nf-btns">
            <button
              className="nf-tb"
              aria-pressed={player.shuffle}
              aria-label="Shuffle"
              title={player.shuffle ? "Shuffle on" : "Shuffle off"}
              onClick={() => {
                player.toggleShuffle();
                toast(player.shuffle ? "Shuffle on" : "Shuffle off");
              }}
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
              aria-pressed={player.repeat !== "off"}
              aria-label="Repeat"
              title={
                player.repeat === "one"
                  ? "Repeat one"
                  : player.repeat === "all"
                    ? "Repeat all"
                    : "Repeat off"
              }
              onClick={() => {
                player.cycleRepeat();
                const mode = usePlayer.getState().repeat;
                toast(
                  mode === "all" ? "Repeat: all" : mode === "one" ? "Repeat: one" : "Repeat off"
                );
              }}
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
