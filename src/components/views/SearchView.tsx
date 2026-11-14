"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { TrackRow } from "@/components/track/TrackRow";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, Search, X } from "lucide-react";
import { usePlayer } from "@/stores/player";
import { hueFromId } from "@/lib/format";

/* browse tiles shown before the user types — each one runs a search */
const GENRES = [
  "OPM",
  "Pinoy Pop",
  "Acoustic",
  "Chill",
  "Throwback",
  "Hip-hop",
  "Lo-fi",
  "Podcasts",
];

export function SearchView() {
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => ctrlRef.current?.abort();
  }, []);

  /* aborts any earlier request, so a slow old response can never overwrite newer results */
  const runSearch = useCallback(async (query: string): Promise<Track[]> => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: ctrl.signal,
      });
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

  /* debounce typing; clear everything when the box is short */
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      ctrlRef.current?.abort();
      setTracks([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => {
      void runSearch(query);
    }, 350);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    const list = await runSearch(query);
    // Enter plays the first result once it has actually loaded
    if (list.length) usePlayer.getState().playQueue(list, 0, `Search: ${query}`);
  };

  const hits = tracks.slice(0, 30);
  const top = hits[0];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight md:hidden">Search</h1>
      <form onSubmit={onSubmit}>
        <div className="group relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search songs, artists, albums…"
            className="h-14 w-full rounded-2xl border border-border bg-card pl-12 pr-12 text-lg outline-none transition-all placeholder:text-muted-foreground focus:border-foreground/25 focus:bg-accent/60 focus:shadow-[0_0_0_4px_rgba(255,255,255,0.04)]"
            aria-label="Search"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-10 flex-1" />
            </div>
          ))}
        </div>
      )}

      {!loading && top && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Top result
          </p>
          <button
            onClick={() => usePlayer.getState().playQueue(hits, 0, `Search: ${q.trim()}`)}
            className="group flex w-full max-w-xl items-center gap-5 rounded-2xl p-4 text-left transition-colors hover:bg-card"
            style={{
              background: `linear-gradient(135deg, hsl(${hueFromId(top.videoId)} 55% 22% / 0.6), transparent 80%)`,
            }}
          >
            <img
              src={top.thumb}
              alt=""
              className="h-24 w-24 shrink-0 rounded-xl object-cover shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-2xl font-bold tracking-tight">{top.title}</span>
              <span className="mt-1 block truncate text-sm text-muted-foreground">
                Song · {top.artist}
              </span>
            </span>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5eead4,#7c5cff)] text-black opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition-all group-hover:opacity-100">
              <Play className="h-5 w-5 translate-x-[1px] fill-current" />
            </span>
          </button>
        </div>
      )}

      {!loading && hits.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Songs</h2>
          <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            {hits.map((t, i) => (
              <TrackRow key={t.videoId} track={t} index={i} showIndex list={hits} />
            ))}
          </div>
        </div>
      )}

      {!loading && searched && tracks.length === 0 && (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <p className="font-medium">No results for &ldquo;{q}&rdquo;</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Check the spelling or try different keywords.
          </p>
        </div>
      )}

      {!loading && !searched && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Browse all</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setQ(g)}
                className="relative h-28 overflow-hidden rounded-xl p-4 text-left text-xl font-extrabold transition-transform hover:-translate-y-0.5"
                style={{
                  background: `linear-gradient(135deg, hsl(${hueFromId(g)} 60% 42%), hsl(${(hueFromId(g) + 60) % 360} 55% 18%))`,
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
