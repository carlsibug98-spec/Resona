"use client";

import { create } from "zustand";

export type View =
  | { name: "home" }
  | { name: "search"; q?: string }
  | { name: "artist"; id: string; label?: string }
  | { name: "album"; id: string; label?: string; thumb?: string; subtitle?: string }
  | { name: "playlist"; id: string; label?: string }
  | { name: "library"; tab?: "liked" | "playlists" | "history" | "downloads" }
  | { name: "settings" };

interface UiState {
  views: View[];
  importOpen: boolean;
  fullPlayer: boolean;
  setImportOpen: (v: boolean) => void;
  setFullPlayer: (v: boolean) => void;
  navigate: (v: View) => void;
  back: () => void;
  view: () => View;
  canBack: () => boolean;
}

export const useUi = create<UiState>()((set, get) => ({
  views: [{ name: "home" }],
  importOpen: false,
  fullPlayer: false,
  setImportOpen: (importOpen) => set({ importOpen }),
  setFullPlayer: (fullPlayer) => set({ fullPlayer }),
  navigate: (v) =>
    set((s) => {
      const cur = s.views[s.views.length - 1];
      if (JSON.stringify(cur) === JSON.stringify(v)) return s;
      return { views: [...s.views.slice(-24), v] };
    }),
  back: () =>
    set((s) => (s.views.length > 1 ? { views: s.views.slice(0, -1) } : s)),
  view: () => get().views[get().views.length - 1],
  canBack: () => get().views.length > 1,
}));
