"use client";

import { useEffect, useState, type MouseEvent } from "react";
import type { Track } from "@/lib/types";
import { useLibrary } from "@/stores/library";
import { useDownloadProgress } from "@/stores/download-progress";
import { useDownloads } from "@/stores/downloads";
import { deleteDownloadedAudio, downloadTrackWithDetail } from "@/lib/downloads";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Check, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** Starts a download and reports the outcome honestly. */
export async function startDownload(track: Track) {
  const result = await downloadTrackWithDetail(track);
  const status = result.status;

  if (status === "offline-saved") {
    toast.success(`Saved “${track.title}” for offline listening`);
  } else if (status === "busy") {
    toast.info("Already downloading");
  } else if (status === "stream-only") {
    const provisioning = useDownloads.getState().status === "provisioning";
    toast.error("Couldn't download this track", {
      description: provisioning
        ? "The download service is still setting itself up — try again in a minute."
        : "No audio stream could be resolved right now. Streaming playback still works.",
      action: provisioning
        ? {
            label: "Retry",
            onClick: () => void startDownload(track),
          }
        : undefined,
    });
  } else {
    toast.error("Download failed — check your connection and try again");
  }
}

/** Removes saved audio and its library entry. */
export async function removeDownload(track: Track) {
  try {
    await deleteDownloadedAudio(track.videoId);
    useLibrary.getState().removeDownload(track.videoId);
    toast.success("Download removed");
  } catch {
    toast.error("Couldn't remove the download — try again");
  }
}

/** Circular progress; value -1 is an indeterminate spinner. */
function Ring({ value }: { value: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  const indeterminate = value < 0;
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("h-4 w-4", indeterminate ? "animate-spin" : "-rotate-90")}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
      <circle
        cx="10" cy="10" r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={indeterminate ? c * 0.75 : c * (1 - value)}
      />
    </svg>
  );
}

export function DownloadButton({
  track,
  labelled = false,
  revealOnHover = false,
  className,
}: {
  track: Track;
  labelled?: boolean;
  /** hide the idle icon until the parent row is hovered */
  revealOnHover?: boolean;
  className?: string;
}) {
  const saved = useLibrary((s) => !!s.downloads[track.videoId]?.complete);
  const progress = useDownloadProgress((s) => s.active[track.videoId]);
  const busy = progress !== undefined;
  const capability = useDownloads((s) => s.status);
  const init = useDownloads((s) => s.init);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  // the server has no way to resolve audio — don't offer downloads at all
  if (capability === "unavailable" && !saved) return null;

  // first run: the server is still fetching its downloader
  const preparing = capability === "provisioning" && !saved && !busy;

  const label = preparing
    ? "Setting up the downloader…"
    : busy
      ? progress < 0
        ? "Downloading"
        : `Downloading ${Math.round(progress * 100)}%`
      : saved
        ? "Saved offline — tap to remove"
        : "Download for offline";

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (busy || preparing) return;
    if (saved) {
      setConfirmRemove(true); // one tap must not delete the offline copy
    } else {
      void startDownload(track);
    }
  };

  const dim = revealOnHover && !busy && !saved && !preparing;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={preparing}
        aria-label={label}
        title={label}
        className={cn(
          labelled
            ? "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors hover:text-foreground disabled:opacity-60"
            : "flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-foreground disabled:cursor-wait",
          saved ? "text-emerald-400" : busy || preparing ? "text-foreground" : "text-muted-foreground",
          dim && "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
          className
        )}
      >
        {busy ? (
          <Ring value={progress} />
        ) : preparing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <Check className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {labelled && (
          <span>
            {busy ? "Saving…" : preparing ? "Preparing…" : saved ? "Saved" : "Download"}
          </span>
        )}
      </button>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the offline copy?</AlertDialogTitle>
            <AlertDialogDescription>
              “{track.title}” will be deleted from this device. You can
              download it again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void removeDownload(track)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
