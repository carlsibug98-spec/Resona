"use client";

import { create } from "zustand";
import type { Track } from "@/lib/types";

export type View =
  | { name: "home" }
  | { name: "search"; q?: string }
  | { name: "artist"; id: string; label?: string }
  | { name: "album"; id: string; label?: string; thumb?: string; subtitle?: string }
  | { name: "playlist"; id: string; label?: string }
  | { name: "library"; tab?: "liked" | "playlists" | "history" | "downloads" }
  | { name: "trending" }
  | { name: "settings" };

/** every dialog in the app renders through the mockup's scrim + modal */
export type ModalState =
  | null
  | { kind: "import" }
  | { kind: "trackMenu"; track: Track; fromPlaylistId?: string }
  | { kind: "addToPlaylist"; track: Track }
  | { kind: "createPlaylist" }
  | { kind: "playlistMenu"; id: string; name: string }
  | { kind: "renamePlaylist"; id: string; name: string }
  | { kind: "confirmDeletePlaylist"; id: string; name: string }
  | { kind: "confirmRemoveDownload"; track: Track }
  | { kind: "confirmRemoveStarter" };

export type PanelTab = "queue" | "lyrics";
export type NfMode = "lyrics" | "video" | null;

interface UiState {
  views: View[];
  fwd: View[];
  panel: boolean;
  panelTab: PanelTab;
  nfMode: NfMode;
  modal: ModalState;
  fullPlayer: boolean;
  /** mockup v3 queue drawer — the right-side panel with drag-to-reorder */
  queueDrawer: boolean;
  /** width of the docked queue column, px (drag its left edge to change) */
  queueWidth: number;
  setQueueWidth: (w: number) => void;
  /** Spotify-style: the library folds into an icon rail */
  libCollapsed: boolean;
  toggleLib: () => void;
  togglePanel: () => void;

  setImportOpen: (v: boolean) => void;
  setFullPlayer: (v: boolean) => void;
  setQueueDrawer: (v: boolean) => void;
  toggleQueueDrawer: () => void;
  openPanel: (tab: PanelTab) => void;
  closePanel: () => void;
  setPanelTab: (tab: PanelTab) => void;
  setNfMode: (m: NfMode) => void;
  openModal: (m: ModalState) => void;
  closeModal: () => void;
  navigate: (v: View) => void;
  replace: (v: View) => void;
  back: () => void;
  forward: () => void;
  view: () => View;
  canBack: () => boolean;
  canForward: () => boolean;
}

export const useUi = create<UiState>()((set, get) => ({
  views: [{ name: "home" }],
  fwd: [],
  panel: false,
  panelTab: "queue",
  nfMode: null,
  modal: null,
  fullPlayer: false,
  queueDrawer: false,
  queueWidth: 340,
  setQueueWidth: (queueWidth) => set({ queueWidth }),
  libCollapsed: false,
  toggleLib: () => set((s) => ({ libCollapsed: !s.libCollapsed })),
  togglePanel: () => set((s) => (s.panel ? { panel: false } : { panel: true, queueDrawer: false })),

  setImportOpen: (v) => set({ modal: v ? { kind: "import" } : null }),
  setFullPlayer: (fullPlayer) => set({ fullPlayer }),
  setQueueDrawer: (queueDrawer) => set(queueDrawer ? { queueDrawer, panel: false } : { queueDrawer }),
  toggleQueueDrawer: () => set((s) => (s.queueDrawer ? { queueDrawer: false } : { queueDrawer: true, panel: false })),
  openPanel: (tab) =>
    set((s) => {
      const open = !(s.panel && s.panelTab === tab);
      // the now-playing panel and the queue share the right-hand column
      return { panel: open, panelTab: tab, queueDrawer: open ? false : s.queueDrawer };
    }),
  closePanel: () => set({ panel: false }),
  setPanelTab: (panelTab) => set({ panelTab }),
  setNfMode: (nfMode) => set({ nfMode }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),

  navigate: (v) =>
    set((s) => {
      const cur = s.views[s.views.length - 1];
      if (JSON.stringify(cur) === JSON.stringify(v)) return s;
      return { views: [...s.views.slice(-24), v], fwd: [] };
    }),
  replace: (v) =>
    set((s) => {
      const views = s.views.slice(0, -1);
      return { views: [...views, v] };
    }),
  back: () =>
    set((s) => {
      if (s.views.length < 2) return s;
      const cur = s.views[s.views.length - 1];
      return { views: s.views.slice(0, -1), fwd: [...s.fwd.slice(-24), cur] };
    }),
  forward: () =>
    set((s) => {
      if (!s.fwd.length) return s;
      const v = s.fwd[s.fwd.length - 1];
      return {
        views: [...s.views.slice(-24), v],
        fwd: s.fwd.slice(0, -1),
      };
    }),
  view: () => get().views[get().views.length - 1],
  canBack: () => get().views.length > 1,
  canForward: () => get().fwd.length > 0,
}));
