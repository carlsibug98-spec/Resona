"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Track } from "@/lib/types";
import {
  mirrorLike,
  mirrorUnlike,
  mirrorPlaylist,
  mirrorPlaylistDelete,
  mirrorHistory,
  pushFullLibrary,
} from "@/lib/library-sync";

export interface DownloadEntry {
  track: Track;
  size?: number;
  mime?: string;
  downloadedAt: number;
  complete: boolean; // false = stream-only fallback (no audio stored)
}

interface HistoryEntry {
  track: Track;
  at: number;
}

interface LibraryState {
  liked: Record<string, { track: Track; likedAt: number }>;
  playlists: {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    tracks: Track[];
  }[];
  downloads: Record<string, DownloadEntry>;
  history: HistoryEntry[];

  isLiked: (videoId: string) => boolean;
  toggleLike: (track: Track) => void;

  createPlaylist: (name: string, tracks?: Track[]) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, tracks: Track | Track[]) => number;
  removeFromPlaylist: (id: string, videoId: string) => void;

  markDownloaded: (
    videoId: string,
    track: Track,
    opts?: { size?: number; mime?: string; complete?: boolean }
  ) => void;
  removeDownload: (videoId: string) => void;

  pushHistory: (track: Track) => void;

  clearAll: () => void;
}

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      liked: {},
      playlists: [],
      downloads: {},
      history: [],

      isLiked: (videoId) => videoId in get().liked,

      toggleLike: (track) => {
        const s = get();
        const wasLiked = !!s.liked[track.videoId];
        if (wasLiked) mirrorUnlike(track.videoId);
        else mirrorLike(track, Date.now());
        set((s2) => {
          const liked = { ...s2.liked };
          if (liked[track.videoId]) delete liked[track.videoId];
          else liked[track.videoId] = { track, likedAt: Date.now() };
          return { liked };
        });
      },

      createPlaylist: (name, tracks) => {
        const id = uid();
        const now = Date.now();
        const playlist = {
          id,
          name: name.trim() || "New playlist",
          createdAt: now,
          updatedAt: now,
          tracks: tracks ? [...tracks] : [],
        };
        set((s) => ({ playlists: [playlist, ...s.playlists] }));
        mirrorPlaylist(playlist);
        return id;
      },

      renamePlaylist: (id, name) => {
        const now = Date.now();
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id ? { ...p, name, updatedAt: now } : p
          ),
        }));
        const p = get().playlists.find((p) => p.id === id);
        if (p) mirrorPlaylist(p);
      },

      deletePlaylist: (id) => {
        set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }));
        mirrorPlaylistDelete(id);
      },

      addToPlaylist: (id, tracks) => {
        const list = Array.isArray(tracks) ? tracks : [tracks];
        let added = 0;
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== id) return p;
            const have = new Set(p.tracks.map((t) => t.videoId));
            const fresh = list.filter((t) => !have.has(t.videoId));
            added = fresh.length;
            return {
              ...p,
              tracks: [...p.tracks, ...fresh],
              updatedAt: Date.now(),
            };
          }),
        }));
        const p = get().playlists.find((p) => p.id === id);
        if (p) mirrorPlaylist(p);
        return added;
      },

      removeFromPlaylist: (id, videoId) => {
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id
              ? {
                  ...p,
                  tracks: p.tracks.filter((t) => t.videoId !== videoId),
                  updatedAt: Date.now(),
                }
              : p
          ),
        }));
        const p = get().playlists.find((p) => p.id === id);
        if (p) mirrorPlaylist(p);
      },

      markDownloaded: (videoId, track, opts) =>
        set((s) => ({
          downloads: {
            ...s.downloads,
            [videoId]: {
              track,
              size: opts?.size,
              mime: opts?.mime,
              downloadedAt: Date.now(),
              complete: opts?.complete ?? true,
            },
          },
        })),

      removeDownload: (videoId) =>
        set((s) => {
          const downloads = { ...s.downloads };
          delete downloads[videoId];
          return { downloads };
        }),

      pushHistory: (track) => {
        set((s) => ({
          history: [
            { track, at: Date.now() },
            ...s.history.filter((h) => h.track.videoId !== track.videoId),
          ].slice(0, 200),
        }));
        mirrorHistory(track, Date.now());
      },

      clearAll: () => {
        set({ liked: {}, playlists: [], downloads: {}, history: [] });
        void pushFullLibrary();
      },
    }),
    { name: "resona-library" }
  )
);
