"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Track } from "@/lib/types";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";

/**
 * Starter content — first run looks exactly like the approved mockup:
 * the same OPM tracks on the home shelves, "Late night" playlist,
 * liked seeds and a small play history. Every seed is resolved into a
 * real, playable track through /api/search the moment it is needed —
 * no invented video ids anywhere.
 *
 * The whole starter set is clearly labelled and can be removed in
 * Settings → Starter content.
 */

export interface Seed {
  key: string;
  title: string;
  artist: string;
  hue: number;
  noLyricsHint?: boolean;
}

export const SEEDS: Seed[] = [
  { key: "t1", title: "Mahal Magmahal", artist: "Esremborak", hue: 18 },
  { key: "t2", title: "Totoong tayo", artist: "Jin DC", hue: 205 },
  { key: "t3", title: "Janice", artist: "Dilaw", hue: 150 },
  { key: "t4", title: "Padaba Taka", artist: "dwta", hue: 34 },
  { key: "t5", title: "Tahanan", artist: "El Manu", hue: 280 },
  { key: "t6", title: "Mahal Magmahal (RnB Version)", artist: "Aira Pescador", hue: 330 },
  { key: "t7", title: "Mahal MagMahal · cover by Zel", artist: "Dreaminks 2.0", hue: 0, noLyricsHint: true },
  { key: "t8", title: "Esremborak Sessions, Pt. 2", artist: "Mellow Uploads", hue: 240 },
];

export const SEED_BY_KEY = Object.fromEntries(SEEDS.map((s) => [s.key, s]));

/** mockup hue for a seed track, looked up by its resolved videoId */
export function seedHue(videoId: string): number | undefined {
  const st = useSeedTracks.getState();
  const hit = Object.entries(st.resolved).find(([, t]) => t?.videoId === videoId);
  return hit ? SEED_BY_KEY[hit[0]]?.hue : undefined;
}

/* starter arrangement — mirrors the mockup's state exactly */
export const SEED_LIKED = ["t1", "t3"];
export const SEED_HISTORY_PUSH_ORDER = ["t1", "t5", "t4", "t2"]; // ends as t2,t4,t5,t1
export const SEED_PLAYLIST = { name: "Late night", keys: ["t5", "t4", "t7"] };

export interface SeedMix {
  name: string;
  hue: number;
  sub: string;
  keys: string[];
}

export const SEED_MIXES: SeedMix[] = [
  { name: "Mellow OPM", hue: 340, sub: "Esremborak, Dilaw and more", keys: ["t1", "t6", "t8", "t3"] },
  { name: "Throwback Pinoy", hue: 30, sub: "Padaba Taka, Tahanan", keys: ["t4", "t5", "t2"] },
  { name: "Esremborak Radar", hue: 10, sub: "Because you played Mahal Magmahal", keys: ["t1", "t7", "t8"] },
];

interface SeedState {
  resolved: Record<string, Track | null>;
  playlistId: string | null;
  resolving: Record<string, boolean>;
  resolve: (key: string) => Promise<Track | null>;
  resolveMany: (keys: string[]) => Promise<void>;
  setPlaylistId: (id: string | null) => void;
}

export const useSeedTracks = create<SeedState>()(
  persist(
    (set, get) => ({
      resolved: {},
      playlistId: null,
      resolving: {},

      resolve: async (key) => {
        const st = get();
        if (st.resolved[key]) return st.resolved[key]!;
        if (st.resolving[key]) return null;
        const seed = SEED_BY_KEY[key];
        if (!seed) return null;
        set((s) => ({ resolving: { ...s.resolving, [key]: true } }));
        try {
          const r = await fetch(
            `/api/search?q=${encodeURIComponent(`${seed.title} ${seed.artist}`)}`
          );
          const d = await r.json();
          const list: Track[] = Array.isArray(d.tracks) ? d.tracks : [];
          // prefer the first result whose artist matches the seed loosely
          const hit =
            list.find(
              (t) =>
                t.artist.toLowerCase().includes(seed.artist.toLowerCase().split(" ")[0]) &&
                t.title.toLowerCase().includes(seed.title.toLowerCase().split(" ")[0])
            ) || list[0] || null;
          set((s) => ({ resolved: { ...s.resolved, [key]: hit } }));
          return hit;
        } catch {
          set((s) => ({ resolved: { ...s.resolved, [key]: null } }));
          return null;
        } finally {
          set((s) => {
            const resolving = { ...s.resolving };
            delete resolving[key];
            return { resolving };
          });
        }
      },

      resolveMany: async (keys) => {
        for (const k of keys) await get().resolve(k);
      },

      setPlaylistId: (playlistId) => set({ playlistId }),
    }),
    { name: "resona-seeds", partialize: (s) => ({ resolved: s.resolved, playlistId: s.playlistId }) }
  )
);

/** resolved Track for a seed key (or null while unresolved) */
export function seedTrack(key: string): Track | null {
  return useSeedTracks.getState().resolved[key] ?? null;
}

/**
 * Applies the mockup's starter library once, on first run, after the
 * seeds have resolved. Everything it creates is tagged through the
 * seed store so "remove starter content" can undo it precisely.
 */
export async function applyStarterContent() {
  const settings = useSettings.getState();
  if (settings.starterContent !== "seed") return;
  if (settings.starterAppliedAt) return;

  const lib = useLibrary.getState();
  // a library the user already built — never overwrite it
  const hasUserData =
    Object.keys(lib.liked).length > 0 || lib.playlists.length > 0 || lib.history.length > 0;
  if (hasUserData) {
    settings.setStarterAppliedAt(Date.now());
    return;
  }

  await useSeedTracks.getState().resolveMany(SEEDS.map((s) => s.key));

  const st = useSeedTracks.getState();
  const resolved = (key: string) => st.resolved[key] || null;

  // liked: t1 + t3 (mockup)
  for (const key of SEED_LIKED) {
    const t = resolved(key);
    if (t && !lib.isLiked(t.videoId)) lib.toggleLike(t);
  }

  // playlist: "Late night" with t5, t4, t7 (mockup)
  const plTracks = SEED_PLAYLIST.keys.map(resolved).filter(Boolean) as Track[];
  let playlistId: string | null = null;
  if (plTracks.length) {
    playlistId = useLibrary
      .getState()
      .createPlaylist(SEED_PLAYLIST.name, plTracks);
    useSeedTracks.getState().setPlaylistId(playlistId);
  }

  // history: ends up t2, t4, t5, t1 like the mockup
  for (const key of SEED_HISTORY_PUSH_ORDER) {
    const t = resolved(key);
    if (t) useLibrary.getState().pushHistory(t);
  }

  useSettings.getState().setStarterAppliedAt(Date.now());
}

/** Settings → Starter content: removes exactly what the seeder created */
export function removeStarterContent() {
  const st = useSeedTracks.getState();
  const ids = Object.values(st.resolved)
    .filter((t): t is Track => !!t)
    .map((t) => t.videoId);
  const lib = useLibrary.getState();

  const liked = { ...useLibrary.getState().liked };
  for (const id of ids) delete liked[id];
  useLibrary.setState({ liked });

  if (st.playlistId) lib.deletePlaylist(st.playlistId);
  useSeedTracks.getState().setPlaylistId(null);

  useLibrary.setState({
    history: useLibrary.getState().history.filter((h) => !ids.includes(h.track.videoId)),
  });

  const settings = useSettings.getState();
  settings.setStarterContent("cleared");
}
