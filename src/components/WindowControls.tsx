"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ThumbarAction, ThumbarState } from "@/lib/thumbar";

/** exposed by desktop/preload.js inside the Electron app only */
declare global {
  interface Window {
    resonaDesktop?: {
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximizeChange: (cb: (maximized: boolean) => void) => void;
      /** taskbar playback controls (see TaskbarControls.tsx) */
      setThumbarState: (s: ThumbarState) => void;
      onThumbarAction: (cb: (action: ThumbarAction) => void) => () => void;
    };
  }
}

const noSubscribe = () => () => {};

/** true inside the desktop app, false in a browser and during server render */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => !!window.resonaDesktop,
    () => false
  );
}

/** Windows-style min / max / close, drawn in the header because the window has no native frame */
export function WindowControls() {
  const desktop = useIsDesktop();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = window.resonaDesktop;
    if (!api) return;
    void api.isMaximized().then(setMaximized);
    api.onMaximizeChange(setMaximized);
  }, []);

  if (!desktop || !window.resonaDesktop) return null;
  const api = window.resonaDesktop;

  return (
    <div className="winctl">
      <button type="button" onClick={() => api.minimize()} aria-label="Minimize">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button type="button" onClick={() => api.toggleMaximize()} aria-label={maximized ? "Restore" : "Maximize"}>
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maximized ? (
            <path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1" />
          ) : (
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          )}
        </svg>
      </button>
      <button type="button" className="close" onClick={() => api.close()} aria-label="Close">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0L10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
    </div>
  );
}
