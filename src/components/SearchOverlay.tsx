"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Track } from "@/lib/types";
import { MiniArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";

interface ArtistHit {
  artistId: string;
  name: string;
  thumb?: string;
}

/* ------------------------------ recent searches ------------------------------ */

const RECENT_KEY = "resona-recent-searches";
const RECENT_MAX = 8;

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(q: string) {
  const query = q.trim();
  if (query.length < 2) return;
  const list = loadRecent().filter((x) => x.toLowerCase() !== query.toLowerCase());
  saveRecent([query, ...list]);
}

export function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* private mode etc. — recents are best-effort */
  }
}

/* --------------------------------- overlay ---------------------------------- */

type DropRow =
  | { kind: "recent"; text: string }
  | { kind: "suggest"; text: string }
  | { kind: "track"; track: Track }
  | { kind: "artist"; artist: ArtistHit };

/** no-op subscription for useSyncExternalStore's mounted flag */
const noSubscribe = () => () => {};

/**
 * Spotify-style search overlay: the top-bar search is a real input now.
 * Focusing it opens a dropdown over the CURRENT page — no navigation.
 * Empty query → recent searches; typing → live suggestions plus the first
 * artist/song hits with artwork. Enter jumps to the full search page
 * (which keeps the genre tiles and the deep results list); ↑↓ moves,
 * Esc closes, outside click closes.
 */
export function SearchOverlay() {
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dropTracks, setDropTracks] = useState<Track[]>([]);
  const [dropArtists, setDropArtists] = useState<ArtistHit[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [dropPos, setDropPos] = useState({ top: 64, left: 320, width: 480 });
  const inputRef = useRef<HTMLInputElement>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  // portals only exist client-side; a sync store gives the mounted flag
  // without the setState-in-effect pattern
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  const player = usePlayer();
  const navigate = useUi((s) => s.navigate);

  // measure the input's box whenever the dropdown opens (and on resize):
  // positioning from state keeps refs out of the render path
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      setDropPos({
        top: r.bottom + 8,
        left: Math.max(8, r.left - 60),
        width: Math.min(560, window.innerWidth - Math.max(8, r.left - 60) - 8),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // Ctrl+L / Cmd+L or "/" focuses search, Esc closes — Spotify shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName || "");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setRecents(loadRecent());
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setRecents(loadRecent());
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  /** debounced dropdown fetch: query suggestions + the first song hits.
   *  Short/closed queries schedule a microtask to clear so no state is
   *  written synchronously inside the effect. */
  useEffect(() => {
    const query = q.trim();
    const t = setTimeout(
      () => {
        if (!open || query.length < 2) {
          setSuggestions([]);
          setDropTracks([]);
          setDropArtists([]);
          setCursor(-1);
          return;
        }
        void (async () => {
          ctrlRef.current?.abort();
          const ctrl = new AbortController();
          ctrlRef.current = ctrl;
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
            /* dropdown is best-effort */
          }
        })();
      },
      220
    );
    return () => clearTimeout(t);
  }, [q, open]);

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

  /** run the search on the full page (the only thing that navigates) */
  const openSearchPage = useCallback(
    (text: string) => {
      pushRecent(text);
      setOpen(false);
      setQ(text);
      navigate({ name: "search", q: text });
    },
    [navigate]
  );

  const playRow = useCallback(
    (row: DropRow) => {
      if (row.kind === "track") {
        player.playQueue([row.track], 0, `Search: ${row.track.title}`);
        pushRecent(row.track.title);
        setOpen(false);
      } else if (row.kind === "artist") {
        pushRecent(row.artist.name);
        setOpen(false);
        navigate({ name: "artist", id: row.artist.artistId, label: row.artist.name });
      } else {
        openSearchPage(row.text);
      }
    },
    [player, navigate, openSearchPage]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && dropRows.length) {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => Math.min(c + 1, dropRows.length - 1));
    } else if (e.key === "ArrowUp" && dropRows.length) {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === "Enter") {
      const query = q.trim();
      if (cursor >= 0 && dropRows[cursor]) {
        e.preventDefault();
        playRow(dropRows[cursor]);
      } else if (query.length >= 2) {
        e.preventDefault();
        openSearchPage(query);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
      inputRef.current?.blur();
    }
  };

  return (
    <div className="tsearch-wrap" ref={wrapRef}>
      <label className={`topsearch${open ? " focus" : ""}`}>
        <Icon name="search" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setRecents(loadRecent());
            setOpen(true);
          }}
          onFocus={() => {
            setRecents(loadRecent());
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="What do you want to play?"
          autoComplete="off"
          aria-label="Search songs, artists, albums"
        />
        {q ? (
          <button
            className="iconbtn"
            aria-label="Clear search"
            onClick={(e) => {
              e.preventDefault();
              setQ("");
              inputRef.current?.focus();
            }}
          >
            <Icon name="x" />
          </button>
        ) : (
          <span className="kbd-hint">ctrl L</span>
        )}
      </label>

      {mounted &&
        open &&
        createPortal(
          <div
            className="tsearch-drop"
            ref={dropRef}
            role="listbox"
            aria-label="Search suggestions"
            style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
          >
            {q.trim().length < 2 ? (
              recents.length > 0 ? (
                <div className="sdrop-h">Recent searches</div>
              ) : (
                <div className="sdrop-h">Search Resona</div>
              )
            ) : (
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
                    onClick={() => playRow(row)}
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
                    onClick={() => playRow(row)}
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
                  onClick={() => playRow(row)}
                  onMouseEnter={() => setCursor(i)}
                >
                  <MiniArt track={row.track} className="sdrop-art" />
                  <span className="sdrop-t trunc">
                    <b>{row.track.title}</b>
                  </span>
                  <span className="sdrop-sub trunc">Song · {row.track.artist}</span>
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
          </div>,
          document.body
        )}
    </div>
  );
}
