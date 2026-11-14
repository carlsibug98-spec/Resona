"use client";

import { useEffect, useState } from "react";
import type { LyricLine, Track } from "@/lib/types";

export type LyricsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "synced"; lines: LyricLine[] }
  | { status: "plain"; text: string }
  | { status: "none" };

const cache = new Map<string, LyricsState>();

/**
 * Synced lyrics for the current track, fetched from the lrclib route.
 * Results are cached per videoId for the session. State is derived from
 * the cache on render — effects only ever setState from async callbacks.
 */
export function useLyrics(track: Track | null, duration?: number): LyricsState {
  const key = track?.videoId ?? null;
  const [fetched, setFetched] = useState<{ key: string; state: LyricsState } | null>(null);

  useEffect(() => {
    if (!track || !key || cache.has(key)) return;
    let cancelled = false;
    const q = new URLSearchParams({
      title: track.title,
      artist: track.artist,
      ...(duration ? { duration: String(Math.round(duration)) } : {}),
    });
    fetch(`/api/lyrics?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        let next: LyricsState;
        if (d?.synced?.length) next = { status: "synced", lines: d.synced };
        else if (d?.plain) next = { status: "plain", text: d.plain };
        else next = { status: "none" };
        cache.set(key, next);
        setFetched({ key, state: next });
      })
      .catch(() => {
        if (!cancelled) {
          const next: LyricsState = { status: "none" };
          cache.set(key, next);
          setFetched({ key, state: next });
        }
      });
    return () => {
      cancelled = true;
    };
    // refetch when the real duration arrives — it improves lrclib matching
  }, [key, track?.title, track?.artist, duration]);

  if (!track || !key) return { status: "idle" };
  const cached = cache.get(key);
  if (cached) return cached;
  if (fetched && fetched.key === key) return fetched.state;
  return { status: "loading" };
}

/** index of the line that is active at `pos` seconds (-1 before the first) */
export function lineIndexAt(lines: LyricLine[], pos: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= pos) idx = i;
    else break;
  }
  return idx;
}
