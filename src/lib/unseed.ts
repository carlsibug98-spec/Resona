"use client";

/**
 * One-time migration for v1.6.9: removes the starter content that earlier
 * versions seeded on first run (a "Late night" playlist, two seeded likes
 * and a bit of play history — all OPM tracks from the mockup era).
 *
 * Identification is by content, not videoId: the seeder resolved seeds
 * through live search at runtime, so the same seed key could land on
 * different videos per device. Matching title+artist is stable (see
 * unseed-match.ts for the pure logic + tests).
 *
 * Runs once, guarded by the `unseededAt` timestamp in settings. Removal
 * is mirrored to the server and awaited so the SQLite copy can't re-merge
 * the seeds back at the next boot.
 */

import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { isStarterPlaylist, isStarterTrack } from "@/lib/unseed-match";

function mirror(body: Record<string, unknown>): Promise<unknown> {
  return fetch("/api/library/mutate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    /* best-effort: the next snapshot sync reconciles */
  });
}

/**
 * Remove the old starter content from this device and the server copy.
 * Safe by design: only exact title+artist matches are touched, and only
 * once (the settings flag). Anything the user added themselves — other
 * songs, other playlists, extra likes — is never modified. Awaits the
 * server-side deletions so a caller can safely hydrate right after.
 */
export async function removeStarterContent(): Promise<void> {
  const settings = useSettings.getState();
  if (settings.unseededAt) return;

  const lib = useLibrary.getState();
  const liked = { ...lib.liked };
  const removedLiked: string[] = [];
  const serverDeletes: Promise<unknown>[] = [];

  for (const [id, entry] of Object.entries(liked)) {
    if (isStarterTrack(entry.track)) {
      delete liked[id];
      removedLiked.push(id);
    }
  }

  const playlists = lib.playlists.filter((p) => {
    if (!isStarterPlaylist(p)) return true;
    serverDeletes.push(mirror({ action: "playlist.delete", id: p.id }));
    return false;
  });

  const history = lib.history.filter((h) => {
    if (!isStarterTrack(h.track)) return true;
    serverDeletes.push(mirror({ action: "history.delete", videoId: h.track.videoId }));
    return false;
  });

  for (const id of removedLiked) serverDeletes.push(mirror({ action: "unlike", videoId: id }));

  useLibrary.setState({ liked, playlists, history });

  await Promise.allSettled(serverDeletes);
  settings.setUnseededAt(Date.now());
}
