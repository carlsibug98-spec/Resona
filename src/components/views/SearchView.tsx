"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { CoverArt, MiniArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { useSeedTracks, seedTrack, SEEDS } from "@/lib/seed";
import { markStep } from "@/lib/onboarding";

interface ArtistHit {
  artistId: string;
  name: string;
  thumb?: string;
}

/* ------------------------------ recent searches ------------------------------ */

const RECENT_KEY = "resona-recent-searches";
const RECENT_MAX = 8;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* private mode etc. — recents are best-effort */
  }
}

function pushRecent(q: string) {
  const query = q.trim();
  if (query.length < 2) return;
  const list = loadRecent().filter((x) => x.toLowerCase() !== query.toLowerCase());
  saveRecent([query, ...list]);
}

/* --------------------------------- browse tiles ------------------------------ */

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

type DropRow =
  | { kind: "recent"; text: string }
  | { kind: "suggest"; text: string }
  | { kind: "track"; track: Track }
  | { kind: "artist"; artist: ArtistHit };

export function SearchView() {
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [artists, setArtists] = useState<ArtistHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [failed, setFailed] = useState(false);
  /** live dropdown state (Spotify-style): open while the box is focused */
  const [dropOpen, setDropOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dropTracks, setDropTracks] = useState<Track[]>([]);
  const [dropArtists, setDropArtists] = useState<ArtistHit[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const dropCtrlRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLLabelElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const player = usePlayer();
  const library = useLibrary();
  const resolved = useSeedTracks((s) => s.resolved);
  const navigate = useUi((s) => s.navigate);

  useEffect(() => {
    inputRef.current?.focus();
    setRecents(loadRecent());
    return () => {
      ctrlRef.current?.abort();
      dropCtrlRef.current?.abort();
    };
  }, []);

  /* ---------------------------- full search (debounced) -------------------- */

  const runSearch = useCallback(async (query: string): Promise<Track[]> => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    setFailed(false);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
      if (r.ok) {
        const d = await r.json();
        if (ctrl.signal.aborted) return [];
        const list: Track[] = Array.isArray(d.tracks) ? d.tracks : [];
        const hits: ArtistHit[] = Array.isArray(d.artists) ? d.artists : [];
        setTracks(list);
        setArtists(hits);
        setShowAll(false);
        setSearched(true);
        return list;
      }
      throw new Error(`search ${r.status}`);
    } catch {
      if (!ctrl.signal.aborted) {
        setTracks([]);
        setArtists([]);
        setSearched(true);
        setFailed(true);
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
      setArtists([]);
      setSearched(false);
      setShowAll(false);
      setLoading(false);
      setFailed(false);
      return;
    }
    const t = setTimeout(() => void runSearch(query), 350);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  /* ----------------------- live dropdown (Spotify-style) ------------------- */

  /** debounced dropdown fetch: query suggestions + the first song hits,
   *  so the dropdown can show "mr. loverman — Song · Ricky Montgomery"
   *  rows with art while the user is still typing */
  useEffect(() => {
    const query = q.trim();
    if (!dropOpen || query.length < 2) {
      setSuggestions([]);
      setDropTracks([]);
      setDropArtists([]);
      setCursor(-1);
      return;
    }
    const t = setTimeout(async () => {
      dropCtrlRef.current?.abort();
      const ctrl = new AbortController();
      dropCtrlRef.current = ctrl;
      try {
        const [sugR, hitR] = await Promise.all([
          fetch(`/api/search?suggest=1&q=${encodeURIComponent(query)}`, { signal: ctrl.signal }),
          fetch(`/api/search?q=${encodeURIComponent(query)}&limit=6`, { signal: ctrl.signal }),
        ]);
        if (ctrl.signal.aborted) return;
        const sug = sugR.ok ? ((await sugR.json()).suggestions as string[]) || [] : [];
        const hit = hitR.ok ? await hitR.json() : {};
        setSuggestions(sug.filter((s) => s.toLowerCase() !== query.toLowerCase()).slice(0, 5));
        setDropTracks(Array.isArray(hit.tracks) ? hit.tracks.slice(0, 4) : []);
        setDropArtists(Array.isArray(hit.artists) ? hit.artists.slice(0, 3) : []);
        setCursor(-1);
      } catch {
        /* dropdown is best-effort; the main search still reports errors */
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, dropOpen]);

  // flat row model for keyboard navigation
  const dropRows = useMemo<DropRow[]>(() => {
    const out: DropRow[] = [];
    if (q.trim().length < 2) {
      for (const r of recents) out.push({ kind: "recent", text: r });
      return out;
    }
    for (const s of suggestions) out.push({ kind: "suggest", text: s });
    for (const a of dropArtists) out.push({ kind: "artist", artist: a });
    for (const t of dropTracks) out.push({ kind: "track", track: t });
    return out;
  }, [q, recents, suggestions, dropArtists, dropTracks]);

  const commitQuery = useCallback(
    (text: string) => {
      pushRecent(text);
      setRecents(loadRecent());
      setQ(text);
      setDropOpen(false);
      inputRef.current?.focus();
    },
    []
  );

  const playDropRow = useCallback(
    (row: DropRow) => {
      if (row.kind === "track") {
        player.playQueue([row.track], 0, `Search: ${row.track.title}`);
        commitQuery(row.track.title);
      } else if (row.kind === "artist") {
        navigate({ name: "artist", id: row.artist.artistId, label: row.artist.name });
        commitQuery(row.artist.name);
      } else {
        commitQuery(row.text);
      }
    },
    [player, navigate, commitQuery]
  );

  // close the dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setDropOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [dropOpen]);

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

  const hits = showAll ? tracks : tracks.slice(0, 12);
  const top = localHits[0] ?? hits[0];
  const topIsLocal = localHits.length > 0;

  return (
    <>
      <div className="hero tight">
        <h1>Search</h1>
      </div>
      <label className="sbox" ref={boxRef}>
        <Icon name="search" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setDropOpen(true);
          }}
          onFocus={() => setDropOpen(true)}
          placeholder="What do you want to listen to?"
          autoComplete="off"
          aria-label="Search songs, artists, albums"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && dropRows.length) {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, dropRows.length - 1));
            } else if (e.key === "ArrowUp" && dropRows.length) {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, -1));
            } else if (e.key === "Enter") {
              if (cursor >= 0 && dropRows[cursor]) {
                e.preventDefault();
                playDropRow(dropRows[cursor]);
              } else if (q.trim().length >= 2) {
                pushRecent(q.trim());
                setRecents(loadRecent());
                setDropOpen(false);
                if (hits.length) {
                  const ctx = [...localHits, ...hits];
                  player.playQueue(ctx, 0, `Search: ${q.trim()}`);
                }
              }
            } else if (e.key === "Escape") {
              setDropOpen(false);
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

      {/* Spotify-style dropdown: recents when idle, suggestions + top hits
          while typing — ↑↓ to move, Enter to run, Esc to dismiss */}
      {dropOpen && dropRows.length > 0 && (
        <div className="sdrop" ref={dropRef} role="listbox" aria-label="Search suggestions">
          {q.trim().length < 2 && (
            <div className="sdrop-h">
              <span>Recent searches</span>
            </div>
          )}
          {q.trim().length >= 2 && (
            <div className="sdrop-h keys">
              <span className="keys-nav">
                <Icon name="chev-down" className="xs flip" />
                <Icon name="chev-down" className="xs" /> to navigate
              </span>
              <span>
                <kbd>Enter</kbd> to search
              </span>
            </div>
          )}
          {dropRows.map((row, i) => {
            const on = i === cursor;
            if (row.kind === "recent" || row.kind === "suggest") {
              return (
                <button
                  key={`${row.kind}-${row.text}`}
                  className={`sdrop-row${on ? " on" : ""}`}
                  role="option"
                  aria-selected={on}
                  onClick={() => commitQuery(row.text)}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span className="sdrop-ic">
                    <Icon name={row.kind === "recent" ? "clock" : "search"} />
                  </span>
                  <span className="sdrop-t trunc">{row.text}</span>
                  {row.kind === "recent" && <span className="sdrop-x">Clear</span>}
                </button>
              );
            }
            if (row.kind === "artist") {
              return (
                <button
                  key={`ar-${row.artist.artistId}`}
                  className={`sdrop-row${on ? " on" : ""}`}
                  role="option"
                  aria-selected={on}
                  onClick={() => playDropRow(row)}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span className="cov round xs">
                    {row.artist.thumb ? (
                      <img src={row.artist.thumb} alt="" loading="lazy" />
                    ) : (
                      <span>{row.artist.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="sdrop-t trunc">
                    <b>{row.artist.name}</b>
                  </span>
                  <span className="sdrop-sub">Artist</span>
                </button>
              );
            }
            return (
              <button
                key={`tr-${row.track.videoId}`}
                className={`sdrop-row${on ? " on" : ""}`}
                role="option"
                aria-selected={on}
                onClick={() => playDropRow(row)}
                onMouseEnter={() => setCursor(i)}
              >
                <MiniArt track={row.track} className="sdrop-art" />
                <span className="sdrop-t trunc">
                  <b>{row.track.title}</b>
                </span>
                <span className="sdrop-sub trunc">
                  Song · {row.track.artist}
                </span>
              </button>
            );
          })}
          {q.trim().length < 2 && recents.length > 0 && (
            <button
              className="sdrop-clear"
              onClick={() => {
                saveRecent([]);
                setRecents([]);
              }}
            >
              Clear recent searches
            </button>
          )}
        </div>
      )}

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
      ) : failed ? (
        <div className="empty">
          <Icon name="search" />
          <h3>Search is unreachable right now</h3>
          <p>The music source didn&apos;t answer. Check your connection and try again.</p>
          <button className="btn2 ghost" onClick={() => void runSearch(q.trim())}>
            Try again
          </button>
        </div>
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

          {artists.length > 0 && (
            <>
              <div className="section-h s20">
                <h2>Artists</h2>
              </div>
              <div className="shelf hscroll">
                {artists.map((a) => (
                  <div className="card-item" key={a.artistId}>
                    <button
                      className="face"
                      onClick={() => navigate({ name: "artist", id: a.artistId, label: a.name })}
                    >
                      <span className="cov round">
                        {a.thumb ? (
                          <img src={a.thumb} alt={a.name} loading="lazy" />
                        ) : (
                          <span>{a.name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </span>
                      <span className="t trunc">{a.name}</span>
                      <span className="s">Artist</span>
                    </button>
                  </div>
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
                {tracks.length > hits.length && !showAll && (
                  <button className="btn2 ghost sm" onClick={() => setShowAll(true)}>
                    Show all {tracks.length} results
                  </button>
                )}
              </div>
              <div className="tlist">
                <TrackTableHead />
                {hits.map((t, i) => (
                  <TrackRow key={t.videoId} track={t} index={i} list={hits} contextLabel={`Search: ${q.trim()}`} />
                ))}
              </div>
            </>
          ) : localHits.length === 0 && artists.length === 0 ? (
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
