"use client";

import { useDownloadProgress } from "@/stores/download-progress";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { deleteDownloadedAudio, downloadTrack } from "@/lib/downloads";
import { toast } from "@/stores/toast";
import type { Track } from "@/lib/types";

export type DlState =
  | { kind: "idle" }
  | { kind: "active"; p: number } // 0..1, or -1 when size unknown
  | { kind: "done" }
  | { kind: "stream-only" };

export function dlStateFor(videoId: string): DlState {
  const entry = useLibrary.getState().downloads[videoId];
  const active = useDownloadProgress.getState().active[videoId];
  if (active !== undefined) return { kind: "active", p: active };
  if (entry) return entry.complete ? { kind: "done" } : { kind: "stream-only" };
  return { kind: "idle" };
}

/** Starts a download and reports an honest outcome for every terminal state. */
export async function startDownload(track: Track): Promise<void> {
  const status = await downloadTrack(track);
  switch (status) {
    case "offline-saved":
      toast(`“${track.title}” is available offline`, true);
      break;
    case "stream-only":
      toast(
        "No direct audio stream available right now — nothing was saved. Streaming still works.",
        false
      );
      break;
    case "busy":
      toast("Already downloading…");
      break;
    case "failed":
      toast("Download failed — check your connection and try again.");
      break;
  }
}

/** Click on a done download → confirm removal (audio is deleted from the device). */
export function requestRemoveDownload(track: Track) {
  useUi.getState().openModal({ kind: "confirmRemoveDownload", track });
}

/** Actually removes audio + library entry after confirmation. */
export async function removeDownloadConfirmed(videoId: string) {
  await deleteDownloadedAudio(videoId).catch(() => {});
  useLibrary.getState().removeDownload(videoId);
  toast("Removed from downloads");
}
