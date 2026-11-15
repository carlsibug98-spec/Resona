"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Track } from "@/lib/types";

/**
 * Client-side duration cache. YT Music omits duration on official song
 * rows, so missing values are resolved in the background through
 * /api/durations and kept in localStorage for instant future renders.
 */

interface DurationsState {
  map: Record<string, number>;
  put: (id: string, secs: number) => void;
  merge: (entries: Record<string, number>) => void;
}

const MAX_ENTRIES = 4000;

export const useDurations = create<DurationsState>()(
  persist(
    (set) => ({
      map: {},
      put: (id, secs) =>
        set((s) => (s.map[id] === secs ? s : { map: { ...s.map, [id]: secs } })),
      merge: (entries) =>
        set((s) => {
          const keys = Object.keys(s.map);
          let map = { ...s.map, ...entries };
          if (keys.length > MAX_ENTRIES) {
            map = Object.fromEntries(Object.entries(map).slice(-MAX_ENTRIES));
          }
          return { map };
        }),
    }),
    { name: "resona-durations", partialize: (s) => ({ map: s.map }) }
  )
);

// --- batching -----------------------------------------------------------

const queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
const failedUntil = new Map<string, number>();

async function flush() {
  timer = null;
  if (!queue.size) return;
  const now = Date.now();
  const ids: string[] = [];
  for (const id of queue) {
    if ((failedUntil.get(id) || 0) < now) ids.push(id);
    queue.delete(id);
    if (ids.length >= 60) break;
  }
  if (queue.size && !timer) timer = setTimeout(flush, 250);
  if (!ids.length) return;
  try {
    const res = await fetch(`/api/durations?ids=${ids.join(",")}`);
    if (!res.ok) throw new Error(`durations ${res.status}`);
    const data: Record<string, number> = await res.json();
    const found = Object.fromEntries(
      Object.entries(data).filter(([, v]) => typeof v === "number" && v > 0)
    );
    if (Object.keys(found).length) useDurations.getState().merge(found);
    // ids the server could not resolve: back off for 10 minutes
    const t = Date.now() + 10 * 60 * 1000;
    for (const id of ids) if (!(id in found)) failedUntil.set(id, t);
  } catch {
    const t = Date.now() + 60 * 1000;
    for (const id of ids) failedUntil.set(id, t);
  }
}

function ensure(ids: string[]) {
  const { map } = useDurations.getState();
  for (const id of ids) {
    if (map[id] || queue.has(id)) continue;
    queue.add(id);
  }
  if (queue.size && !timer) timer = setTimeout(flush, 200);
}

/**
 * Returns the best-known duration (seconds) for a track and schedules a
 * background fetch when it is unknown. Falls back to the track's own
 * field first (search rows / player backfill), then the cache.
 */
export function useTrackDuration(track?: Track | null): number | undefined {
  const cached = useDurations((s) =>
    track?.videoId ? s.map[track.videoId] : undefined
  );
  const own = track?.duration;
  const id = track?.videoId;
  const value = own && own > 0 ? own : cached;

  useEffect(() => {
    if (id && !value) ensure([id]);
  }, [id, value]);

  return value;
}
