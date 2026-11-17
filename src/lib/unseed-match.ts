/**
 * Pure matching logic for the v1.6.9 unseed migration — no store or
 * browser imports so it runs under `node --test`. The migration itself
 * (store updates + server mirroring) lives in unseed.ts.
 */

import type { Track } from "@/lib/types";

/** the eight starter tracks the old seeder looked up (seed.ts, ≤ v1.6.8) */
const STARTER_LOOKUPS: { title: string; artist: string }[] = [
  { title: "Mahal Magmahal", artist: "Esremborak" },
  { title: "Totoong tayo", artist: "Jin DC" },
  { title: "Janice", artist: "Dilaw" },
  { title: "Padaba Taka", artist: "dwta" },
  { title: "Tahanan", artist: "El Manu" },
  { title: "Mahal Magmahal (RnB Version)", artist: "Aira Pescador" },
  { title: "Mahal MagMahal · cover by Zel", artist: "Dreaminks 2.0" },
  { title: "Esremborak Sessions, Pt. 2", artist: "Mellow Uploads" },
];

/** the playlist name the old seeder created */
export const STARTER_PLAYLIST_NAME = "Late night";

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** does this track look like one of the starter songs? */
export function isStarterTrack(t: Track): boolean {
  const title = norm(t.title);
  const artist = norm(t.artist);
  return STARTER_LOOKUPS.some(
    (s) => norm(s.title) === title && norm(s.artist) === artist
  );
}

/**
 * Should the "Late night" playlist be deleted? Only when it still carries
 * its seeded name and its tracks are (mostly) starter songs — a user who
 * rebuilt "Late night" with their own music keeps it.
 */
export function isStarterPlaylist(p: { name: string; tracks: Track[] }): boolean {
  if (norm(p.name) !== norm(STARTER_PLAYLIST_NAME)) return false;
  if (p.tracks.length === 0) return true; // empty seeded shell — remove
  const starterCount = p.tracks.filter(isStarterTrack).length;
  return starterCount >= Math.ceil(p.tracks.length * 0.6);
}
