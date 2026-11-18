import type { Track } from "@/lib/types";
import { downloadTrack } from "@/lib/downloads";
import { useDownloadProgress } from "@/stores/download-progress";
import { useLibrary } from "@/stores/library";

/**
 * Musify's OfflinePlaylistService._processDownloadQueue, adapted to
 * Resona's IndexedDB storage:
 *
 * - a playlist downloads as a SEQUENTIAL queue, one track at a time —
 *   parallel downloads would burst /api/stream resolutions the same way
 *   the v1.7.2 parallel client race burst /player and tripped the bot
 *   gate (one resolve in flight per moment, exactly like playback)
 * - tracks already saved are skipped and counted as completed (Musify's
 *   isSongAlreadyOffline short-circuit)
 * - progress is per-playlist {total, completed, failed} plus the existing
 *   per-track percentage store, so the UI can show both
 * - cancel() stops after the current track finishes (Musify's
 *   isCancelled check between queue items)
 */

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  cancelled: boolean;
  /** the track currently downloading, for the "Downloading X…" label */
  currentTitle: string | null;
}

const batches = new Map<string, BatchProgress>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribeBatches(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getBatch(playlistId: string): BatchProgress | undefined {
  return batches.get(playlistId);
}

export function readBatches(): Record<string, BatchProgress> {
  return Object.fromEntries(batches);
}

export function cancelBatch(playlistId: string): void {
  const b = batches.get(playlistId);
  if (b && b.completed + b.failed < b.total) b.cancelled = true;
  notify();
}

export function isBatchActive(playlistId: string): boolean {
  const b = batches.get(playlistId);
  return !!b && b.completed + b.failed < b.total;
}

/**
 * Download every not-yet-saved track of a playlist, one at a time.
 * Returns when the queue drains (or is cancelled). Safe to re-call:
 * a running batch for the same playlist is returned as-is.
 */
export async function downloadPlaylist(
  playlistId: string,
  tracks: Track[]
): Promise<BatchProgress> {
  const running = batches.get(playlistId);
  if (running && running.completed + running.failed < running.total) return running;

  // count already-offline tracks as completed without re-fetching them
  const lib = useLibrary.getState();
  const pending = tracks.filter((t) => !lib.downloads[t.videoId]);

  const progress: BatchProgress = {
    total: tracks.length,
    completed: tracks.length - pending.length,
    failed: 0,
    cancelled: false,
    currentTitle: null,
  };
  batches.set(playlistId, progress);
  notify();

  for (const track of pending) {
    if (progress.cancelled) break;
    progress.currentTitle = track.title;
    notify();
    try {
      const status = await downloadTrack(track);
      if (status === "offline-saved") progress.completed++;
      else progress.failed++;
    } catch {
      progress.failed++;
    }
  }

  progress.currentTitle = null;
  notify();
  return progress;
}
