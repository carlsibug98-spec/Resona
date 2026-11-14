"use client";

import { create } from "zustand";

/**
 * Live download progress, keyed by videoId. Kept out of the persisted
 * library store so per-chunk updates never touch localStorage.
 * A value of -1 means the total size is unknown (indeterminate).
 */
interface DownloadProgressState {
  active: Record<string, number>;
  start: (id: string) => void;
  update: (id: string, progress: number) => void;
  finish: (id: string) => void;
}

export const useDownloadProgress = create<DownloadProgressState>()((set) => ({
  active: {},
  start: (id) => set((s) => ({ active: { ...s.active, [id]: 0 } })),
  update: (id, progress) =>
    set((s) => (id in s.active ? { active: { ...s.active, [id]: progress } } : s)),
  finish: (id) =>
    set((s) => {
      const active = { ...s.active };
      delete active[id];
      return { active };
    }),
}));
