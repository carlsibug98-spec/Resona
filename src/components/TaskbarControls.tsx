"use client";

import { useEffect } from "react";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { useIsDesktop } from "@/components/WindowControls";
import { thumbarState, type ThumbarAction } from "@/lib/thumbar";

/**
 * Playback controls on the desktop shell, Spotify-style:
 * on Windows they are the prev / play-pause / next buttons on the taskbar
 * hover preview; on macOS the same three live in the dock menu.
 *
 * Renders nothing — it only watches the player and talks to the bridge
 * exposed by desktop/preload.js. In a browser this component is inert.
 */
export function TaskbarControls() {
  const desktop = useIsDesktop();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const index = usePlayer((s) => s.index);
  const queueLength = usePlayer((s) => s.queue.length);
  const repeat = usePlayer((s) => s.repeat);
  const autoplayRadio = useSettings((s) => s.autoplayRadio);

  // push the control state whenever anything that affects it changes
  useEffect(() => {
    const api = window.resonaDesktop;
    if (!desktop || !api?.setThumbarState) return;
    api.setThumbarState(
      thumbarState({ isPlaying, index, queue: { length: queueLength }, repeat, autoplayRadio })
    );
  }, [desktop, isPlaying, index, queueLength, repeat, autoplayRadio]);

  // clicks arrive from the main process — route them to the player store
  useEffect(() => {
    const api = window.resonaDesktop;
    if (!desktop || !api?.onThumbarAction) return;
    return api.onThumbarAction((action: ThumbarAction) => {
      const s = usePlayer.getState();
      if (action === "prev") s.prev();
      else if (action === "next") s.next();
      else s.toggle();
    });
  }, [desktop]);

  return null;
}
