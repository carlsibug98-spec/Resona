"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  region: string;
  resolverInstances: string;
  showVideo: boolean;
  lastBackupAt: number | null;
  setLastBackupAt: (t: number | null) => void;
  setRegion: (r: string) => void;
  setResolverInstances: (s: string) => void;
  setShowVideo: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      region: "Global",
      resolverInstances: "",
      showVideo: false,
      lastBackupAt: null,
      setLastBackupAt: (lastBackupAt) => set({ lastBackupAt }),
      setRegion: (region) => set({ region }),
      setResolverInstances: (resolverInstances) => set({ resolverInstances }),
      setShowVideo: (showVideo) => set({ showVideo }),
    }),
    { name: "resona-settings" }
  )
);
