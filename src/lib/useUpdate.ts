"use client";

import { useEffect, useState } from "react";
import { checkForUpdate, type UpdateInfo } from "@/lib/update-check";
import { useSettings } from "@/stores/settings";

/**
 * One silent check per hour, on app open. Surfaces "update available"
 * in the account menu and Settings → Updates.
 */
export function useUpdateAvailable(): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkForUpdate().then((i) => {
      if (cancelled) return;
      setInfo(i);
      useSettings.getState().setUpdateCheckedAt(Date.now());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

export type { UpdateInfo };
