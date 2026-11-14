import type { HistoryItem, LikedMap, ParsedBackup, PlaylistEntry } from "@/lib/backup-parse";
import type { Track } from "@/lib/types";

/**
 * Pure merge rules for restoring a backup. No store or browser imports,
 * so they're covered by `node --test`.
 *
 * merge    keeps everything on this device and adds what the file has
 * replace  discards this device's data in the selected sections
 */

export type Section = "liked" | "playlists" | "history";
export type RestoreMode = "merge" | "replace";

export interface LibrarySnapshot {
  liked: LikedMap;
  playlists: PlaylistEntry[];
  history: HistoryItem[];
}

/** Union by videoId. Keeps the earlier track object; the later like time wins. */
export function mergeLiked(current: LikedMap, incoming: LikedMap): LikedMap {
  const out: LikedMap = Object.create(null);
  for (const id of Object.keys(current)) out[id] = current[id];
  for (const id of Object.keys(incoming)) {
    const inc = incoming[id];
    const cur = out[id];
    out[id] = cur
      ? { track: cur.track, likedAt: Math.max(cur.likedAt, inc.likedAt) }
      : inc;
  }
  return out;
}

function uniqueByVideoId(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => (seen.has(t.videoId) ? false : (seen.add(t.videoId), true)));
}

/** Playlists match by id. Matching playlists get the file's new tracks appended. */
export function mergePlaylists(current: PlaylistEntry[], incoming: PlaylistEntry[]): PlaylistEntry[] {
  const byId = new Map<string, PlaylistEntry>(current.map((p) => [p.id, p]));
  for (const p of incoming) {
    const cur = byId.get(p.id);
    if (!cur) {
      byId.set(p.id, { ...p, tracks: uniqueByVideoId(p.tracks) });
      continue;
    }
    const have = new Set(cur.tracks.map((t) => t.videoId));
    const extra = uniqueByVideoId(p.tracks).filter((t) => !have.has(t.videoId));
    byId.set(p.id, {
      ...cur,
      tracks: [...cur.tracks, ...extra],
      updatedAt: Math.max(cur.updatedAt, p.updatedAt),
    });
  }
  return [...byId.values()];
}

/** One entry per track, most recent play first, capped at the history limit. */
export function mergeHistory(
  current: HistoryItem[],
  incoming: HistoryItem[],
  limit: number
): HistoryItem[] {
  const latest = new Map<string, HistoryItem>();
  for (const h of [...current, ...incoming]) {
    const prev = latest.get(h.track.videoId);
    if (!prev || h.at > prev.at) latest.set(h.track.videoId, h);
  }
  return [...latest.values()].sort((a, b) => b.at - a.at).slice(0, limit);
}

/** Applies only the selected sections. Unselected sections are returned untouched. */
export function applyBackup(
  current: LibrarySnapshot,
  incoming: Pick<ParsedBackup, "liked" | "playlists" | "history">,
  sections: Section[],
  mode: RestoreMode,
  historyLimit: number
): LibrarySnapshot {
  const want = (s: Section) => sections.includes(s);
  return {
    liked: !want("liked")
      ? current.liked
      : mode === "replace"
        ? incoming.liked
        : mergeLiked(current.liked, incoming.liked),
    playlists: !want("playlists")
      ? current.playlists
      : mode === "replace"
        ? incoming.playlists
        : mergePlaylists(current.playlists, incoming.playlists),
    history: !want("history")
      ? current.history
      : mode === "replace"
        ? incoming.history
        : mergeHistory(current.history, incoming.history, historyLimit),
  };
}
