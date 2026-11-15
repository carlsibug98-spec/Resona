"use client";

import { usePlayer } from "@/stores/player";
import { toast } from "@/stores/toast";
import type { Track } from "@/lib/types";

/**
 * Start an endless radio seeded from one track — the YouTube Music mix
 * for that song, played as a queue. Used by the track menu.
 */
export async function startRadio(seed: Track): Promise<void> {
  toast("Starting radio…");
  try {
    const res = await fetch(`/api/radio?videoId=${encodeURIComponent(seed.videoId)}`);
    if (!res.ok) throw new Error("radio_failed");
    const data = await res.json();
    const tracks: Track[] = Array.isArray(data?.tracks) ? data.tracks : [];
    const seen = new Set<string>([seed.videoId]);
    const rest = tracks.filter((t) => {
      if (seen.has(t.videoId)) return false;
      seen.add(t.videoId);
      return true;
    });
    usePlayer
      .getState()
      .playQueue([seed, ...rest], 0, `${seed.title} radio`);
    toast(`Radio · ${rest.length + 1} songs`, true);
  } catch {
    toast("Radio unavailable right now — try again in a moment");
  }
}
