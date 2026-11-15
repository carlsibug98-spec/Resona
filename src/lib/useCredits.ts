"use client";

import { useEffect, useState } from "react";
import type { Track } from "@/lib/types";

export interface CreditPerson {
  name: string;
  role: string;
}

export type CreditsState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      persons: CreditPerson[];
      album?: string;
      year?: string;
      source: string;
    };

const cache = new Map<string, CreditsState>();

/**
 * Real credits for the full-screen card (MusicBrainz behind /api/credits).
 * Session-cached per videoId; state is derived from the cache on render.
 */
export function useCredits(track: Track | null): CreditsState {
  const key = track?.videoId ?? null;
  const [fetched, setFetched] = useState<{ key: string; state: CreditsState } | null>(null);

  useEffect(() => {
    if (!track || !key || cache.has(key)) return;
    let cancelled = false;
    const q = new URLSearchParams({ title: track.title, artist: track.artist });
    fetch(`/api/credits?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const persons: CreditPerson[] = Array.isArray(d?.persons) ? d.persons : [];
        const next: CreditsState = {
          status: "ok",
          persons,
          album: d?.album || undefined,
          year: d?.year || undefined,
          source: d?.source || "none",
        };
        cache.set(key, next);
        setFetched({ key, state: next });
      })
      .catch(() => {
        if (cancelled) return;
        const next: CreditsState = { status: "ok", persons: [], source: "none" };
        cache.set(key, next);
        setFetched({ key, state: next });
      });
    return () => {
      cancelled = true;
    };
  }, [key, track?.title, track?.artist]);

  if (!track || !key) return { status: "idle" };
  const cachedState = cache.get(key);
  if (cachedState) return cachedState;
  if (fetched && fetched.key === key) return fetched.state;
  return { status: "loading" };
}
