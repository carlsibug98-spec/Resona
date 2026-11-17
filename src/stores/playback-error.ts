"use client";

import { create } from "zustand";

/**
 * Persistent playback error state — the actionable successor to the
 * vanishing toast. When a track fails to start, the banner stays until
 * the user picks Retry, Skip, or dismisses it; a new successful play
 * clears it automatically.
 */
interface ErrorState {
  message: string | null;
  /** the track that failed, so Retry can re-load exactly it */
  videoId: string | null;
  show: (message: string, videoId: string | null) => void;
  clear: () => void;
}

export const usePlaybackError = create<ErrorState>()((set) => ({
  message: null,
  videoId: null,
  show: (message, videoId) => set({ message, videoId }),
  clear: () => set({ message: null, videoId: null }),
}));
