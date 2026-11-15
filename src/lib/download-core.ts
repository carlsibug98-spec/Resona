import type { Track } from "@/lib/types";

/**
 * The download flow with every side effect injected, so it can be tested
 * without a browser, IndexedDB or a store.
 *
 * "offline-saved"  audio stored, plays without network
 * "stream-only"    no direct audio stream — nothing is saved
 * "busy"           this track is already downloading
 * "failed"         network or storage error
 */
export type DownloadStatus = "offline-saved" | "stream-only" | "busy" | "failed";

export interface DownloadDeps {
  isBusy: (videoId: string) => boolean;
  begin: (videoId: string) => void;
  /** 0–1, or -1 when the total size is unknown */
  progress: (videoId: string, value: number) => void;
  end: (videoId: string) => void;
  fetchAudio: (track: Track) => Promise<Response>;
  save: (track: Track, blob: Blob, mime: string) => Promise<void>;
  markSaved: (track: Track, size: number, mime: string) => void;
}

export async function runDownload(track: Track, deps: DownloadDeps): Promise<DownloadStatus> {
  if (deps.isBusy(track.videoId)) return "busy";
  deps.begin(track.videoId);
  try {
    const audio = await deps.fetchAudio(track);
    if (!audio.ok || !audio.body) return "stream-only";

    const total = Number(audio.headers.get("content-length") || 0);
    const reader = audio.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      deps.progress(track.videoId, total ? received / total : -1);
    }
    const mime = audio.headers.get("content-type")?.split(";")[0] || "audio/mp4";
    const blob = new Blob(chunks as BlobPart[], { type: mime });
    await deps.save(track, blob, mime);
    deps.markSaved(track, blob.size, mime);
    return "offline-saved";
  } catch {
    return "failed";
  } finally {
    deps.end(track.videoId);
  }
}
