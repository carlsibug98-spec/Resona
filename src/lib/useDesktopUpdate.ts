"use client";

import { useEffect, useState } from "react";

/**
 * Live desktop-updater status, mirrored from the main process.
 *
 * The desktop updater only runs AFTER the window is up (v1.7.10 policy —
 * the startup path never downloads and never quits), so everything the UI
 * knows about a pending update flows through this hook:
 *   idle        — check done, nothing to fetch (or updater not applicable)
 *   downloading — the new installer is streaming in the background
 *   ready       — installer on disk; "Restart to apply" is actionable
 *   error       — check/download failed; honest message, no silent retry
 *
 * Returns null on the web build and in shells without the bridge
 * (unsigned macOS keeps the GitHub-releases fallback).
 */
export interface DesktopUpdateStatus {
  state: "idle" | "downloading" | "ready" | "error";
  percent: number | null;
  version: string | null;
  message: string | null;
}

interface ResonaUpdateBridge {
  onUpdateReady?: (cb: (info: { version?: string | null }) => void) => () => void;
  onUpdateProgress?: (cb: (status: DesktopUpdateStatus) => void) => () => void;
  updateStatus?: () => Promise<DesktopUpdateStatus>;
  installUpdate?: () => void;
}

export function updateBridge(): ResonaUpdateBridge | undefined {
  return (window as unknown as { resonaDesktop?: ResonaUpdateBridge }).resonaDesktop;
}

export function useDesktopUpdateStatus(): DesktopUpdateStatus | null {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);

  useEffect(() => {
    const bridge = updateBridge();
    if (!bridge) return;
    let alive = true;
    // snapshot first (a download may already be in flight), then live events
    bridge.updateStatus
      ?.()
      .then((s) => {
        if (alive && s) setStatus(s);
      })
      .catch(() => {});
    const offProgress = bridge.onUpdateProgress?.((s) => setStatus(s));
    const offReady = bridge.onUpdateReady?.((info) =>
      setStatus({
        state: "ready",
        percent: 100,
        version: info?.version ?? null,
        message: null,
      })
    );
    return () => {
      alive = false;
      try {
        offProgress?.();
      } catch {
        /* bridge gone while quitting */
      }
      try {
        offReady?.();
      } catch {
        /* bridge gone while quitting */
      }
    };
  }, []);

  return status;
}
