"use client";

import { usePlaybackError } from "@/stores/playback-error";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { engine } from "@/lib/player-engine";
import { Icon } from "@/components/Icon";

/**
 * Bottom banner for playback failures. Retry reloads the exact failed
 * track (the queue may already have auto-advanced past it), Skip moves
 * on, and Run diagnostics jumps to the Settings provider report that
 * shows what is failing on this network. Cleared automatically by the
 * next successful play (PlayerProvider clears on onState playing=true).
 */
export function PlaybackErrorBanner() {
  const message = usePlaybackError((s) => s.message);
  const failedId = usePlaybackError((s) => s.videoId);
  const clear = usePlaybackError((s) => s.clear);

  if (!message) return null;

  const retry = () => {
    clear();
    const p = usePlayer.getState();
    // retry the failed track itself — p.current() may be the next song
    const failed =
      p.queue.find((t) => t.videoId === failedId) ??
      (engine.getTrack()?.videoId === failedId ? engine.getTrack() : null) ??
      p.current();
    if (failed) {
      p.playTrack(failed, "Retry");
      engine.setVolume(p.muted ? 0 : p.volume);
    }
  };

  const skip = () => {
    clear();
    usePlayer.getState().next();
  };

  return (
    <div className={`errban${message ? " show" : ""}`} role="alert">
      <b>Couldn&apos;t play this track</b>
      <span className="trunc" style={{ opacity: 0.85 }}>{message}</span>
      <span className="grp">
        <button className="pri" onClick={retry}>Retry</button>
        <button onClick={skip}>Skip</button>
        <button
          className="diag-link"
          onClick={() => {
            clear();
            useUi.getState().navigate({ name: "settings" });
            // the diagnostics button lives below the fold in Settings;
            // trigger it once the view mounts
            setTimeout(() => {
              document
                .querySelector<HTMLButtonElement>("[data-diag-run]")
                ?.click();
            }, 400);
          }}
        >
          Run diagnostics
        </button>
      </span>
      <button className="x" onClick={clear} aria-label="Dismiss">
        <Icon name="x" className="xs" />
      </button>
    </div>
  );
}
