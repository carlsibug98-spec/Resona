"use client";

import type { Track } from "@/lib/types";
import { idbDeleteAudio, idbPutAudio } from "@/lib/idb";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { useDownloadProgress } from "@/stores/download-progress";
import { runDownload, type DownloadStatus } from "@/lib/download-core";

export type { DownloadStatus } from "@/lib/download-core";

export function downloadTrack(track: Track): Promise<DownloadStatus> {
  return runDownload(track, {
    isBusy: (id) => id in useDownloadProgress.getState().active,
    begin: (id) => useDownloadProgress.getState().start(id),
    progress: (id, value) => useDownloadProgress.getState().update(id, value),
    end: (id) => useDownloadProgress.getState().finish(id),
    fetchAudio: (t) => {
      const q = new URLSearchParams({ videoId: t.videoId });
      const instances = useSettings.getState().resolverInstances.trim();
      if (instances) q.set("instances", instances);
      // downloads honour the user's audio-quality setting too
      if (useSettings.getState().audioQuality === "high") q.set("quality", "high");
      // same-origin proxy — googlevideo URLs are IP-bound and blocked by CORS
      return fetch(`/api/stream?${q.toString()}`);
    },
    save: (t, blob, mime) => idbPutAudio(t.videoId, blob, mime),
    markSaved: (t, size, mime) =>
      useLibrary.getState().markDownloaded(t.videoId, t, { size, mime, complete: true }),
  });
}

export async function deleteDownloadedAudio(videoId: string) {
  await idbDeleteAudio(videoId);
}
