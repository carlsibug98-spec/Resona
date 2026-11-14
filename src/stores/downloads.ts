"use client";

import { create } from "zustand";

/**
 * Whether downloads can work on this server.
 *
 *  checking     not asked yet (buttons render optimistically)
 *  provisioning yt-dlp is being downloaded — buttons show a preparing state
 *  ready        yt-dlp or a fallback fleet is available
 *  unavailable  nothing can resolve audio here — buttons are hidden
 */
export type DownloadCapabilityStatus =
  | "checking"
  | "provisioning"
  | "ready"
  | "unavailable";

interface DownloadsState {
  status: DownloadCapabilityStatus;
  provider: "ytdlp" | "instances" | null;
  started: boolean;
  /** idempotent — first caller triggers the capability check */
  init: () => void;
  refresh: () => Promise<void>;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export const useDownloads = create<DownloadsState>((set, get) => ({
  status: "checking",
  provider: null,
  started: false,
  init: () => {
    if (get().started) return;
    set({ started: true });
    void get().refresh();
  },
  refresh: async () => {
    try {
      const r = await fetch("/api/download-capability");
      const d = (await r.json()) as {
        provider?: "ytdlp" | "instances" | "none";
        provisioning?: boolean;
      };
      if (d.provider === "ytdlp" || d.provider === "instances") {
        stopPolling();
        set({ status: "ready", provider: d.provider });
      } else if (d.provisioning) {
        set({ status: "provisioning", provider: null });
        if (!pollTimer) {
          pollTimer = setInterval(() => void get().refresh(), 15000);
        }
      } else {
        stopPolling();
        set({ status: "unavailable", provider: null });
      }
    } catch {
      // network hiccup — keep the current state; don't hide buttons on a fluke
      if (get().status === "checking") set({ status: "unavailable" });
    }
  },
}));
