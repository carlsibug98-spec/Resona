"use client";

import { usePlaybackError } from "@/stores/playback-error";
import { usePlayer } from "@/stores/player";
import { Icon } from "@/components/Icon";
import type { Track } from "@/lib/types";

/**
 * Bottom banner for playback failures: Retry reloads the same track
 * (with a fresh resolve), Skip moves the queue on, and the × hides it.
 * Cleared automatically by the next successful play (PlayerProvider).
 */
export function PlaybackErrorBanner() {
  const message = usePlaybackError((s) => s.message);
  const failedId = usePlaybackError((s) => s.videoId);
  const clear = usePlaybackError((s) => s.clear);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);

  if (!message) return null;

  const retry = () => {
    clear();
    const p = usePlayer.getState();
    const cur = p.current();
    if (cur) p.playFromQueue(p.index);
  };

  const skip = () => {
    clear();
    usePlayer.getState().next();
  };

  const failedTrack: Track | undefined = queue.find(
    (t) => t.videoId === failedId
  );
  void index;

  return (
    <div className={`errban${message ? " show" : ""}`} role="alert">
      <b>Couldn&apos;t play{failedTrack ? ` “${failedTrack.title.slice(0, 32)}”` : ""}</b>
      <span className="trunc" style={{ opacity: 0.85 }}>{message}</span>
      <span className="grp">
        <button className="pri" onClick={retry}>Retry</button>
        <button onClick={skip}>Skip</button>
      </span>
      <button className="x" onClick={clear} aria-label="Dismiss">
        <Icon name="x" className="xs" />
      </button>
    </div>
  );
}
