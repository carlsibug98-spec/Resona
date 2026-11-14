import type { Track } from "@/lib/types";

/**
 * Pure backup parsing: no store or browser imports, so it can run under
 * `node --test`. Accepts v1 (with a `downloads` field, ignored) and v2 files.
 */

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
export const HISTORY_LIMIT = 60;
const MAX_TITLE = 300;
const MAX_ARTIST = 200;
const MAX_PLAYLIST_NAME = 120;
// YouTube video IDs are exactly 11 characters from this alphabet
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type LikedMap = Record<string, { track: Track; likedAt: number }>;
export interface PlaylistEntry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
}
export interface HistoryItem {
  track: Track;
  at: number;
}

export interface ParsedBackup {
  liked: LikedMap;
  playlists: PlaylistEntry[];
  history: HistoryItem[];
  counts: { liked: number; playlists: number; history: number };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Keeps only known fields and rejects anything that isn't a plausible YouTube track. */
export function toTrack(v: unknown): Track | null {
  if (!isObj(v)) return null;
  const videoId = str(v.videoId);
  const title = str(v.title);
  const artist = str(v.artist);
  if (!videoId || !VIDEO_ID.test(videoId) || !title || !artist) return null;
  const thumbRaw = str(v.thumb) ?? "";
  return {
    videoId,
    title: title.slice(0, MAX_TITLE),
    artist: artist.slice(0, MAX_ARTIST),
    thumb: thumbRaw.startsWith("https://") ? thumbRaw : "",
    artistId: str(v.artistId),
    album: str(v.album),
    duration: num(v.duration),
    durationText: str(v.durationText),
    views: str(v.views),
  };
}

/**
 * Parses and validates a backup. Throws an Error with a user-facing message.
 * `byteSize` is the file size, checked before anything is parsed.
 */
export function parseBackupText(text: string, byteSize: number): ParsedBackup {
  if (byteSize > MAX_BACKUP_BYTES)
    throw new Error("That file is over 2 MB, so it isn't a Resona backup.");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isObj(raw)) throw new Error("Unrecognized backup format.");

  // null prototype: a key can never collide with Object.prototype members
  const liked: LikedMap = Object.create(null);
  if (isObj(raw.liked)) {
    for (const entry of Object.values(raw.liked)) {
      if (!isObj(entry)) continue;
      const track = toTrack(entry.track);
      if (track) liked[track.videoId] = { track, likedAt: num(entry.likedAt) ?? Date.now() };
    }
  }

  const playlists: PlaylistEntry[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(raw.playlists)) {
    for (const p of raw.playlists) {
      if (!isObj(p)) continue;
      const id = str(p.id);
      const name = str(p.name);
      if (!id || !name || seenIds.has(id)) continue;
      seenIds.add(id);
      const tracks = Array.isArray(p.tracks)
        ? p.tracks.map(toTrack).filter((t): t is Track => t !== null)
        : [];
      playlists.push({
        id,
        name: name.slice(0, MAX_PLAYLIST_NAME),
        createdAt: num(p.createdAt) ?? Date.now(),
        updatedAt: num(p.updatedAt) ?? Date.now(),
        tracks,
      });
    }
  }

  const history: HistoryItem[] = [];
  if (Array.isArray(raw.history)) {
    for (const h of raw.history) {
      if (!isObj(h)) continue;
      const track = toTrack(h.track);
      if (track) history.push({ track, at: num(h.at) ?? Date.now() });
    }
  }
  const trimmedHistory = history.slice(0, HISTORY_LIMIT);

  const counts = {
    liked: Object.keys(liked).length,
    playlists: playlists.length,
    history: trimmedHistory.length,
  };
  if (counts.liked + counts.playlists + counts.history === 0)
    throw new Error("No Resona library data was found in this file.");

  return { liked, playlists, history: trimmedHistory, counts };
}
