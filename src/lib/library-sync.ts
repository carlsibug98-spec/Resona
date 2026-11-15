/**
 * Client↔server library sync. The zustand store stays the UI's immediate
 * source of truth (instant, offline-safe); every change is also mirrored to
 * the server's SQLite database, and at boot the store is hydrated from it
 * with a last-write-wins merge against localStorage.
 *
 * Why keep localStorage at all? A browser refresh mid-write, or a network
 * blip during mirroring, would otherwise lose a like. Local persistence
 * remains the safety net; the server is the durable copy.
 */
"use client";

import { useLibrary } from "@/stores/library";
import type { Track } from "@/lib/types";

/** history kept in the client store — generous, but bounded */
export const CLIENT_HISTORY_LIMIT = 200;

type MutateBody =
  | { action: "like"; track: Track; likedAt: number }
  | { action: "unlike"; videoId: string }
  | {
      action: "playlist";
      playlist: {
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        tracks: Track[];
      };
    }
  | { action: "playlist.delete"; id: string }
  | { action: "history"; track: Track; at: number };

const queue: MutateBody[] = [];
let sending = false;

/** serialises mutations so a reorder storm can't interleave writes */
async function flush() {
  if (sending) return;
  sending = true;
  try {
    while (queue.length) {
      const body = queue[0];
      try {
        await fetch("/api/library/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // network down: drop the mirrored write; localStorage still has it
        // and the next full snapshot sync will reconcile
      }
      queue.shift();
    }
  } finally {
    sending = false;
  }
}

function mirror(body: MutateBody) {
  if (typeof window === "undefined") return;
  queue.push(body);
  void flush();
}

/* --------------------------- hydration at boot --------------------------- */

let hydrated = false;
let hydratePromise: Promise<void> | null = null;

interface ServerSnapshot {
  liked: Record<string, { track: Track; likedAt: number }>;
  playlists: {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    tracks: Track[];
  }[];
  history: { track: Track; at: number }[];
}

/** last-write-wins per item, mirroring the backup merge semantics */
function mergeSnapshots(local: ServerSnapshot, server: ServerSnapshot): ServerSnapshot {
  const liked: ServerSnapshot["liked"] = { ...local.liked };
  for (const [id, entry] of Object.entries(server.liked)) {
    const mine = liked[id];
    if (!mine || entry.likedAt > mine.likedAt) liked[id] = entry;
  }
  const pls = [...local.playlists];
  for (const sp of server.playlists) {
    const i = pls.findIndex((p) => p.id === sp.id);
    if (i === -1) pls.push(sp);
    else if (sp.updatedAt > pls[i].updatedAt) pls[i] = sp;
  }
  const byId = new Map<string, { track: Track; at: number }>();
  for (const h of [...local.history, ...server.history]) {
    const prev = byId.get(h.track.videoId);
    if (!prev || h.at > prev.at) byId.set(h.track.videoId, h);
  }
  const history = [...byId.values()].sort((a, b) => b.at - a.at).slice(0, CLIENT_HISTORY_LIMIT);
  return { liked, playlists: pls, history };
}

/**
 * Boots the library from the server DB. Called once from AppShell. If the
 * server has nothing (fresh install), the local store is pushed up so the
 * starter content and any pre-existing library survive a reinstall.
 */
export function hydrateLibrary(): Promise<void> {
  if (hydrated) return hydratePromise ?? Promise.resolve();
  hydrated = true;
  hydratePromise = (async () => {
    let server: ServerSnapshot | null = null;
    try {
      const res = await fetch("/api/library");
      if (res.ok) server = (await res.json()) as ServerSnapshot;
    } catch {
      /* offline / server hiccup: local store is fine on its own */
    }
    if (!server) return;

    const local = useLibrary.getState();
    const localSnapshot: ServerSnapshot = {
      liked: local.liked,
      playlists: local.playlists,
      history: local.history,
    };
    const serverEmpty =
      Object.keys(server.liked).length === 0 &&
      server.playlists.length === 0 &&
      server.history.length === 0;

    if (serverEmpty) {
      // fresh database: upload whatever the client has (starter content
      // after first seeding, or an older library from localStorage)
      for (const entry of Object.values(local.liked))
        mirror({ action: "like", track: entry.track, likedAt: entry.likedAt });
      for (const p of local.playlists) mirror({ action: "playlist", playlist: p });
      for (const h of local.history) mirror({ action: "history", track: h.track, at: h.at });
      return;
    }

    const merged = mergeSnapshots(localSnapshot, server);
    useLibrary.setState({
      liked: merged.liked,
      playlists: merged.playlists,
      history: merged.history,
    });
  })();
  return hydratePromise;
}

/** full replace after a backup restore or "clear all" */
export async function pushFullLibrary() {
  const s = useLibrary.getState();
  try {
    await fetch("/api/library", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        liked: s.liked,
        playlists: s.playlists,
        history: s.history,
      }),
    });
  } catch {
    /* local store is still correct; next boot's merge reconciles */
  }
}

/** called by the store's actions — keep exports stable for the store wrapper */
export function mirrorLike(track: Track, likedAt: number) {
  mirror({ action: "like", track, likedAt });
}
export function mirrorUnlike(videoId: string) {
  mirror({ action: "unlike", videoId });
}
export function mirrorPlaylist(p: {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
}) {
  mirror({ action: "playlist", playlist: p });
}
export function mirrorPlaylistDelete(id: string) {
  mirror({ action: "playlist.delete", id });
}
export function mirrorHistory(track: Track, at: number) {
  mirror({ action: "history", track, at });
}
