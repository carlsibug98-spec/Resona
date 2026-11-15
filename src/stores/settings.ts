"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type StarterContent = "seed" | "cleared";

interface SettingsState {
  region: string;
  resolverInstances: string;
  showVideo: boolean;
  autoplayRadio: boolean;
  audioQuality: "standard" | "high";
  lySize: 0 | 1 | 2;
  starterContent: StarterContent;
  starterAppliedAt: number | null;
  lastBackupAt: number | null;
  updateCheckedAt: number | null;

  setLastBackupAt: (t: number | null) => void;
  setRegion: (r: string) => void;
  setResolverInstances: (s: string) => void;
  setShowVideo: (v: boolean) => void;
  setAutoplayRadio: (v: boolean) => void;
  setAudioQuality: (q: "standard" | "high") => void;
  setLySize: (s: 0 | 1 | 2) => void;
  setStarterContent: (v: StarterContent) => void;
  setStarterAppliedAt: (t: number | null) => void;
  setUpdateCheckedAt: (t: number | null) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      region: "Global",
      resolverInstances: "",
      showVideo: true,
      autoplayRadio: true,
      audioQuality: "standard",
      lySize: 1,
      starterContent: "seed",
      starterAppliedAt: null,
      lastBackupAt: null,
      updateCheckedAt: null,

      setLastBackupAt: (lastBackupAt) => set({ lastBackupAt }),
      setRegion: (region) => set({ region }),
      setResolverInstances: (resolverInstances) => set({ resolverInstances }),
      setShowVideo: (showVideo) => set({ showVideo }),
      setAutoplayRadio: (autoplayRadio) => set({ autoplayRadio }),
      setAudioQuality: (audioQuality) => set({ audioQuality }),
      setLySize: (lySize) => set({ lySize }),
      setStarterContent: (starterContent) => set({ starterContent }),
      setStarterAppliedAt: (starterAppliedAt) => set({ starterAppliedAt }),
      setUpdateCheckedAt: (updateCheckedAt) => set({ updateCheckedAt }),
    }),
    {
      name: "resona-settings",
      version: 1,
      migrate: (persisted: unknown, version: number) => {
        const s = (persisted || {}) as Record<string, unknown>;
        // v1.4.0: the video button now plays the real music video and
        // autoplay radio exists — flip both on once for pre-1.4 installs.
        if (version < 1) {
          if (s.showVideo === false) s.showVideo = true;
          if (s.autoplayRadio === undefined) s.autoplayRadio = true;
        }
        return s as unknown as SettingsState;
      },
    }
  )
);
