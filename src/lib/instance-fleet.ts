/**
 * The fallback instance fleet (Piped + Invidious), wired into the stream
 * resolver: many instances from several sources, with the last working one
 * tried first, discovery of fresh instances when the known set dies, and
 * `local=true` proxy URLs from Invidious so the stream is not IP-bound.
 *
 * Pure helpers stay here (no I/O — unit-testable under `node --test`);
 * fetchers live in resolver.ts.
 */

export interface InvidiousFormat {
  itag?: number;
  type?: string;
  bitrate?: number;
  url?: string;
}

export interface PipedAudioStream {
  itag?: number;
  mimeType?: string;
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
 * Pick the best audio format from Invidious adaptiveFormats: audio/mp4 is
 * preferred over webm (better compatibility with <audio> and OS players),
 * then highest bitrate. Mirrors OpenSpot's pickBestAudioFormat.
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
 * the URL is not IP-bound to whoever resolved it and works cross-origin
 * through the instance — exactly what a server-side proxy needs when the
 * direct googlevideo URL is 403ing. Falls back to the direct URL when there
 * is no itag.
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

/**
 * Piped URLs already point at the instance's proxy host (piped proxy
 * domains), so they are used as-is.
 */
export function pickPipedAudio(streams: PipedAudioStream[]): PipedAudioStream | null {
  const withUrl = (streams || []).filter((s) => s.url);
  if (!withUrl.length) return null;
  return withUrl.slice().sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
}

/* ------------------------------- defaults ------------------------------- */

/**
 * Known-live instances as of 2026-11 (verified against the official
 * lists — uptime ≥ 98% on api.invidious.io and the Piped instance list).
 * These are a starting point only: when they die, discoverInstances()
 * fetches a fresh set at runtime.
 */
export const DEFAULT_INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.tiekoetter.com",
  "https://yt.chocolatemoo53.com",
  "https://invidious.materialio.us",
];

export const DEFAULT_PIPED = [
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.ducks.party",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.drgns.space",
];

/**
 * Parse a user's resolver-instances setting (one URL per line, or comma
 * separated) into a clean list. User instances always run before defaults.
 * Bounded: max 6 instances, each ≤ 200 chars — the setting lands in cache
 * keys and upstream fetch URLs, so an unbounded string is a DoS lever.
 */
export function parseInstanceSetting(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\//.test(s) && s.length <= 200)
    .slice(0, 6);
}

/**
 * Guard for stream URLs that came from third-party instance responses.
 * The server fetches and relays these bytes, so an instance response must
 * not be able to aim the proxy (or the verify probe) at loopback, the
 * private ranges or link-local addresses — https only, public hosts only.
 * googlevideo, piped-proxy and invidious `local=true` hosts all pass.
 */
export function isSafeStreamUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".home.arpa") ||
    host.endsWith(".internal")
  )
    return false;
  // IPv4 loopback / private / link-local (dotted form)
  if (/^(?:127|10|169\.254|0)\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return false;
  // IPv6 loopback/unique-local/link-local (URL.hostname keeps the brackets)
  const v6 = host.replace(/^\[|\]$/g, "");
  if (/^(?:::1|::|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/.test(v6)) return false;
  return true;
}

/** parse api.invidious.io's instances.json into base URLs (https only;
 * .onion/.i2p/.ygg entries only resolve on overlay networks — skip them) */
export function parseInvidiousRegistry(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const entry of list) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    const info = (entry[1] || {}) as { type?: string };
    if (info.type !== "https") continue;
    if (/\.(onion|i2p|ygg)$/.test(entry[0])) continue;
    out.push(`https://${entry[0]}`);
  }
  return out;
}

/** pull piped API hosts out of the TeamPiped instance-list markdown table
 * (the "Instance API URL" column — the doc's rows may or may not carry a
 * leading pipe, so we take the first cell that is a bare host URL) */
export function parsePipedInstanceDoc(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    const url = cells.find((c) => /^https?:\/\/[a-z0-9.-]+$/i.test(c));
    if (url) out.push(url);
  }
  return out;
}

/**
 * Race promises until one resolves with a truthy value. Promise.any would
 * resolve with the first *non-rejecting* result — and provider attempts
 * resolve null on failure, so a fast-failing provider would win the race
 * over a slower working one. This waits for the first real answer, or
 * resolves null when every attempt settled empty/failed.
 */
export function firstTruthy<T>(promises: Promise<T | null>[]): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let pending = promises.length;
    let done = false;
    if (!pending) return resolve(null);
    const settle = () => {
      if (!done && --pending === 0) resolve(null);
    };
    for (const p of promises) {
      p.then((r) => {
        if (done) return;
        if (r) {
          done = true;
          resolve(r);
        } else {
          settle();
        }
      }).catch(() => settle());
    }
  });
}
