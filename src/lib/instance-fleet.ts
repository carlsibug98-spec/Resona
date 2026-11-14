/**
 * Pure helpers for the fallback instance fleet (Invidious-style APIs),
 * ported from the OpenSpot approach: many instances, discovered from several
 * lists, with the last working one tried first.
 *
 * No imports, no I/O — unit-testable under `node --test`.
 */

export interface InvidiousFormat {
  itag?: number;
  type?: string;
  bitrate?: number;
  url?: string;
}

/** normalize, filter to http(s), dedupe — order preserved */
export function mergeInstanceLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const base = raw.trim().replace(/\/+$/, "");
      if (!/^https?:\/\//.test(base)) continue;
      if (seen.has(base)) continue;
      seen.add(base);
      out.push(base);
    }
  }
  return out;
}

/** the last working instance goes first, the rest keep their order */
export function orderInstances(all: string[], lastWorking: string | null): string[] {
  if (!lastWorking || !all.includes(lastWorking)) return all;
  return [lastWorking, ...all.filter((i) => i !== lastWorking)];
}

/**
 * Pick the best audio format: audio/mp4 is preferred over webm (better
 * compatibility with <audio> and OS players), then highest bitrate.
 * Mirrors OpenSpot's pickBestAudioFormat.
 */
export function pickBestAudioFormat(formats: InvidiousFormat[]): InvidiousFormat | null {
  const audio = (formats || []).filter(
    (f) => String(f.type || "").startsWith("audio") && (f.itag || f.url)
  );
  if (!audio.length) return null;
  const scored = audio.slice().sort((a, b) => {
    const aMp4 = String(a.type).includes("audio/mp4") ? 1 : 0;
    const bMp4 = String(b.type).includes("audio/mp4") ? 1 : 0;
    if (aMp4 !== bMp4) return bMp4 - aMp4;
    return (b.bitrate || 0) - (a.bitrate || 0);
  });
  return scored[0];
}

/**
 * Invidious local-redirect URL: the instance proxies googlevideo itself, so
 * the URL is not IP-bound to whoever resolved it — exactly what a server-side
 * proxy needs. Falls back to the direct URL when there is no itag.
 */
export function buildAudioUrl(
  base: string,
  videoId: string,
  format: InvidiousFormat
): string | null {
  if (format.itag) {
    return `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=${format.itag}&local=true`;
  }
  return format.url || null;
}
