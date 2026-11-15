"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { CoverArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { useSeedTracks, seedTrack, SEEDS } from "@/lib/seed";
import { markStep } from "@/lib/onboarding";

/* mockup browse tiles: genre → colour */
const GENRES: [string, string][] = [
  ["OPM", "#7c5cff"],
  ["Pinoy Pop", "#e11d74"],
  ["Acoustic", "#0f766e"],
  ["Chill", "#1d4ed8"],
  ["Throwback", "#b45309"],
  ["Hip-hop", "#be123c"],
  ["Lo-fi", "#4d7c0f"],
  ["Podcasts", "#334155"],
];

export function SearchView() {
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const player = usePlayer();
  const library = useLibrary();
  const resolved = useSeedTracks((s) => s.resolved);

  useEffect(() => {
    inputRef.current?.focus();
    return () => ctrlRef.current?.abort();
  }, []);

  const runSearch = useCallback(async (query: string): Promise<Track[]> => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
      const d = await r.json();
      if (ctrl.signal.aborted) return [];
      const list: Track[] = Array.isArray(d.tracks) ? d.tracks : [];
      setTracks(list);
      setSearched(true);
      return list;
    } catch {
      if (!ctrl.signal.aborted) {
        setTracks([]);
        setSearched(true);
      }
      return [];
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const query = q.trim();
    // the first real search finishes the first getting-started step
    if (query.length >= 2) markStep("search");
    if (query.length < 2) {
      ctrlRef.current?.abort();
      setTracks([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => void runSearch(query), 350);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  /** library + starter seeds that match the query — shown above live results */
  const localHits = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const pool: Track[] = [];
    for (const l of Object.values(library.liked)) pool.push(l.track);
    for (const p of library.playlists) pool.push(...p.tracks);
    for (const h of library.history) pool.push(h.track);
    for (const s of SEEDS) {
      const t = resolved[s.key] ?? seedTrack(s.key);
      if (t) pool.push(t);
    }
    const seen = new Set<string>();
    return pool.filter((t) => {
      if (seen.has(t.videoId)) return false;
      seen.add(t.videoId);
      return `${t.title} ${t.artist}`.toLowerCase().includes(query);
    });
  }, [q, library.liked, library.playlists, library.history, resolved]);

  const hits = tracks.slice(0, 30);
  const top = localHits[0] ?? hits[0];
  const topIsLocal = localHits.length > 0;

  return (
    <>
      <div className="hero tight">
        <h1>Search</h1>
      </div>
      <label className="sbox">
        <Icon name="search" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What do you want to listen to?"
          autoComplete="off"
          aria-label="Search songs, artists, albums"
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits.length) {
              const ctx = [...localHits, ...hits];
              player.playQueue(ctx, 0, `Search: ${q.trim()}`);
            }
          }}
        />
        {q && (
          <button
            className="iconbtn"
            aria-label="Clear"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
          >
            <Icon name="x" />
          </button>
        )}
      </label>

      {q.trim().length < 2 ? (
        <>
          <h2 className="browse-h">Browse all</h2>
          <div className="genres">
            {GENRES.map(([g, color]) => (
              <button
                key={g}
                className="genre"
                onClick={() => setQ(g)}
                style={{ background: color }}
              >
                {g}
              </button>
            ))}
          </div>
        </>
      ) : loading ? (
        <p className="muted pad-note">Searching…</p>
      ) : (
        <>
          {localHits.length > 0 && (
            <>
              <div className="section-h s20">
                <h2>From your library</h2>
              </div>
              <div className="tlist">
                {localHits.map((t, i) => (
                  <TrackRow key={t.videoId} track={t} index={i} list={localHits} contextLabel="Your library" />
                ))}
              </div>
            </>
          )}

          {hits.length > 0 ? (
            <>
              <p className="muted kicker-s">Top result</p>
              <button
                className="topres"
                onClick={() => {
                  const ctx = [...localHits, ...hits];
                  player.playQueue(ctx, 0, `Search: ${q.trim()}`);
                }}
              >
                <CoverArt track={top} className="cov" />
                <div className="grow">
                  <div className="big trunc">{top.title}</div>
                  <div className="muted">
                    Song · {top.artist}
                    {topIsLocal ? " · in your library" : ""}
                  </div>
                </div>
                <span className="fab sm">
                  <Icon name="play" fill />
                </span>
              </button>
              <div className="section-h s20">
                <h2>Songs</h2>
              </div>
              <div className="tlist">
                <TrackTableHead />
                {hits.map((t, i) => (
                  <TrackRow key={t.videoId} track={t} index={i} list={hits} contextLabel={`Search: ${q.trim()}`} />
                ))}
              </div>
            </>
          ) : localHits.length === 0 ? (
            <div className="empty">
              <Icon name="search" />
              <h3>No results for “{q.trim()}”</h3>
              <p>Check the spelling or try an artist name.</p>
              <button className="btn2 ghost" onClick={() => setQ("")}>
                Clear search
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
