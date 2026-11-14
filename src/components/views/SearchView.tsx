"use client";

import { useEffect, useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { TrackRow } from "@/components/track/TrackRow";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X } from "lucide-react";
import { usePlayer } from "@/stores/player";

export function SearchView() {
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function runSearch(query: string) {
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => {
        setTracks(d.tracks || []);
        setSearched(true);
      })
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }

  function resetResults() {
    setTracks([]);
    setSearched(false);
    setLoading(false);
  }

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      const t = setTimeout(() => resetResults(), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      runSearch(query);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    runSearch(query);
    // enter plays the first result once loaded
    setTimeout(() => {
      const first = usePlayer.getState();
      if (!first.isPlaying && first.queue.length === 0) {
        const list = tracks;
        if (list.length) first.playQueue(list, 0, `Search: ${query}`);
      }
    }, 900);
  };

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

      {!loading && tracks.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Songs</h2>
          <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            {tracks.slice(0, 30).map((t, i) => (
              <TrackRow key={t.videoId} track={t} index={i} showIndex list={tracks} />
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
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Type at least 2 characters to search millions of tracks.
        </div>
      )}
    </div>
  );
}
