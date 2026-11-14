"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type StarterContent = "seed" | "cleared";

interface SettingsState {
  region: string;
  resolverInstances: string;
  showVideo: boolean;
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
      showVideo: false,
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
      setAudioQuality: (audioQuality) => set({ audioQuality }),
      setLySize: (lySize) => set({ lySize }),
      setStarterContent: (starterContent) => set({ starterContent }),
      setStarterAppliedAt: (starterAppliedAt) => set({ starterAppliedAt }),
      setUpdateCheckedAt: (updateCheckedAt) => set({ updateCheckedAt }),
    }),
    { name: "resona-settings" }
  )
);
