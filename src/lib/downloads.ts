"use client";

import type { Track } from "@/lib/types";
import { idbDeleteAudio, idbPutAudio } from "@/lib/idb";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { useDownloadProgress } from "@/stores/download-progress";
import { runDownload, type DownloadStatus } from "@/lib/download-core";

export type { DownloadStatus } from "@/lib/download-core";

export interface DownloadDetail {
  status: DownloadStatus;
  /** HTTP status of the failed /api/stream call, when there was one */
  httpStatus?: number;
  /** machine-readable error from the stream API, e.g. "unresolvable" */
  apiError?: string;
}

/** Runs the download and also reports why it failed, for honest toasts. */
export async function downloadTrackWithDetail(track: Track): Promise<DownloadDetail> {
  const detail: DownloadDetail = { status: "failed" };
  const status = await runDownload(track, {
    isBusy: (id) => id in useDownloadProgress.getState().active,
    begin: (id) => useDownloadProgress.getState().start(id),
    progress: (id, value) => useDownloadProgress.getState().update(id, value),
    end: (id) => useDownloadProgress.getState().finish(id),
    fetchAudio: async (t) => {
      const q = new URLSearchParams({ videoId: t.videoId });
      const instances = useSettings.getState().resolverInstances.trim();
      if (instances) q.set("instances", instances);
      // same-origin proxy — googlevideo URLs are IP-bound and blocked by CORS
      const r = await fetch(`/api/stream?${q.toString()}`);
      if (!r.ok) {
        detail.httpStatus = r.status;
        try {
          const body = (await r.clone().json().catch(() => ({}))) as { error?: string };
          detail.apiError = body.error;
        } catch {
          /* body isn't JSON — fine */
        }
      }
      return r;
    },
    save: (t, blob, mime) => idbPutAudio(t.videoId, blob, mime),
    markSaved: (t, size, mime) =>
      useLibrary.getState().markDownloaded(t.videoId, t, { size, mime, complete: true }),
  });
  detail.status = status;
  return detail;
}

/** Back-compat wrapper: same behaviour as before, status only. */
export function downloadTrack(track: Track): Promise<DownloadStatus> {
  return downloadTrackWithDetail(track).then((d) => d.status);
}

export async function deleteDownloadedAudio(videoId: string) {
  await idbDeleteAudio(videoId);
}
