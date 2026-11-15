import type { RepeatMode } from "@/lib/types";

/** what the taskbar controls can do (clicks come back from the main process) */
export type ThumbarAction = "prev" | "toggle" | "next";

/** pushed to the desktop bridge whenever playback changes */
export interface ThumbarState {
  playing: boolean;
  /** a track is loaded — gates the play/pause button */
  hasTrack: boolean;
  /** prev works whenever a track is loaded (restart-or-back, like the player bar) */
  hasPrev: boolean;
  /** next only when something will actually play: more tracks, repeat, or autoplay radio */
  hasNext: boolean;
}

/**
 * Derive the taskbar playback-control state from player state.
 *
 * Mirrors the player store's own semantics exactly:
 * - prev() restarts when position > 3 s and otherwise steps back one, so it
 *   is enabled whenever a track is loaded;
 * - next() stops (returns false) at the end of the queue unless repeat is on
 *   or autoplay radio can extend it, so Next is disabled in exactly those
 *   dead-end cases.
 */
export function thumbarState(p: {
  isPlaying: boolean;
  index: number;
  queue: { length: number };
  repeat: RepeatMode;
  autoplayRadio: boolean;
}): ThumbarState {
  const hasTrack = p.index >= 0 && p.index < p.queue.length;
  const hasMore = p.index < p.queue.length - 1;
  return {
    playing: p.isPlaying,
    hasTrack,
    hasPrev: hasTrack,
    hasNext: hasTrack && (hasMore || p.repeat === "all" || p.repeat === "one" || p.autoplayRadio),
  };
}
