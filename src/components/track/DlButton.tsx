"use client";

import { useDownloadProgress } from "@/stores/download-progress";
import { useLibrary } from "@/stores/library";
import { Icon } from "@/components/Icon";
import { requestRemoveDownload, startDownload } from "@/lib/useDownload";
import { toast } from "@/stores/toast";
import type { Track } from "@/lib/types";

/**
 * Mockup download button: arrow → progress ring → green check.
 * Removing a finished download always asks first (offline polish).
 */
export function DlButton({ track }: { track: Track }) {
  const active = useDownloadProgress((s) => s.active[track.videoId]);
  const entry = useLibrary((s) => s.downloads[track.videoId]);

  if (active !== undefined) {
    const p = active >= 0 ? Math.round(active * 100) : 50;
    return (
      <button
        className="iconbtn dlb"
        aria-label={`Downloading ${p}%`}
        title={active >= 0 ? `Downloading ${p}%` : "Downloading"}
        onClick={() => toast("Already downloading…")}
      >
        <span className="dlring" style={{ ["--p" as string]: p }} />
      </button>
    );
  }

  if (entry?.complete) {
    return (
      <button
        className="iconbtn dlb dlok"
        aria-label="Saved offline — open menu to remove"
        title="Saved offline"
        onClick={() => requestRemoveDownload(track)}
      >
        <Icon name="check" />
      </button>
    );
  }

  return (
    <button
      className="iconbtn dlb"
      aria-label="Download for offline"
      title="Download for offline"
      onClick={() => void startDownload(track)}
    >
      <Icon name="download" />
    </button>
  );
}
