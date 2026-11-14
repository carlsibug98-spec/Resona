"use client";

import type { Track } from "@/lib/types";
import { idbDeleteAudio, idbPutAudio } from "@/lib/idb";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";

export type DownloadStatus =
  | "offline-saved"
  | "stream-only"
  | "removed"
  | "failed";

export async function downloadTrack(
  track: Track,
  onProgress?: (pct: number) => void
): Promise<DownloadStatus> {
  const { resolverInstances } = useSettings.getState();
  const lib = useLibrary.getState();
  try {
    const q = new URLSearchParams({ videoId: track.videoId });
    if (resolverInstances.trim())
      q.set("instances", resolverInstances.trim());
    // fetch through the same-origin proxy — googlevideo URLs are
    // IP-bound to the server and blocked by CORS from the browser
    const audio = await fetch(`/api/stream?${q.toString()}`);
    if (!audio.ok || !audio.body) {
      lib.markDownloaded(track.videoId, track, { complete: false });
      return "stream-only";
    }
    const total = Number(audio.headers.get("content-length") || 0);
    const reader = audio.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) onProgress?.(received / total);
    }
    const mime =
      audio.headers.get("content-type")?.split(";")[0] || "audio/mp4";
    const blob = new Blob(chunks as BlobPart[], { type: mime });
    await idbPutAudio(track.videoId, blob, mime);
    lib.markDownloaded(track.videoId, track, {
      size: blob.size,
      mime,
      complete: true,
    });
    return "offline-saved";
  } catch {
    return "failed";
  }
}

export async function deleteDownloadedAudio(videoId: string) {
  await idbDeleteAudio(videoId);
}
