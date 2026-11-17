import { execFile } from "node:child_process";
import { cacheGet, cacheSet, fetchWithTimeout } from "./cache.ts";
import { resolveInnertubeStream } from "./innertube-stream";
import {
  buildAudioUrl,
  DEFAULT_INVIDIOUS,
  DEFAULT_PIPED,
  mergeInstanceLists,
  orderInstances,
  parseInstanceSetting,
  parseInvidiousRegistry,
  parsePipedInstanceDoc,
  pickBestAudioFormat,
  pickPipedAudio,
  type InvidiousFormat,
  type PipedAudioStream,
} from "../instance-fleet";

export interface StreamResult {
  url: string | null;
  provider: string | null;
  bitrate?: number;
  mime?: string;
  /** true when `url` must be fetched through /api/stream's byte proxy
   * (cross-origin or IP-bound): googlevideo URLs from InnerTube/yt-dlp on
   * a matched IP can go direct to the <audio> element instead. */
  proxied?: boolean;
}

const YTDLP_BIN = process.env.YTDLP_PATH || "yt-dlp";

/**
 * Direct InnerTube resolution is ~50x faster than the yt-dlp spawn, but
 * YouTube bot-gates it by IP reputation. When it fails we remember that
 * for a while: without this, a gated IP would re-pay the (fail-fast but
 * nonzero) client-rotation cost on every single track.
 */
const GATE_TTL = 1000 * 60 * 10;
const gateKey = (videoId: string) => `stream:innertube-gated:${videoId}`;

async function tryInnertube(videoId: string): Promise<StreamResult | null> {
  if (cacheGet(gateKey(videoId)) !== null) return null;
  const r = await resolveInnertubeStream(videoId);
  if (!r) {
    cacheSet(gateKey(videoId), { gated: true }, GATE_TTL);
    return null;
  }
  return { url: r.url, provider: r.provider, bitrate: r.bitrate, mime: r.mime };
}

/**
 * Resolve a direct audio URL with a local yt-dlp binary.
 * This is the most reliable provider (maintained extractor, rotates
 * player clients automatically) when one is installed.
 */
async function tryYtDlp(videoId: string): Promise<StreamResult | null> {
  const url = await new Promise<string | null>((resolve) => {
    execFile(
      YTDLP_BIN,
      [
        "-f", "140/251/bestaudio",
        "-g",
        "--no-warnings",
        "--no-playlist",
        "--socket-timeout", "12",
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 25_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const lines = stdout.trim().split("\n").filter(Boolean);
        resolve(lines.length ? lines[lines.length - 1] : null);
      }
    );
  });
  if (!url || !url.startsWith("http")) return null;
  return {
    url,
    provider: "yt-dlp",
    bitrate: 128_000,
    mime: "audio/mp4",
  };
}

/* --------------------- public instance fleet state ---------------------- */

/** the instance that last returned a stream — tried first from now on */
let lastWorkingInstance: string | null = null;

/** discovered instances replace the defaults once fetched (TTL below) */
let discoveredInvidious: string[] | null = null;
let discoveredPiped: string[] | null = null;
let discoveredAt = 0;
const DISCOVERY_TTL = 1000 * 60 * 60 * 6; // refresh every 6h

/**
 * Fetch live instance lists at runtime so the app survives its compiled-in
 * defaults dying. Sources:
 *  - api.invidious.io (the official Invidious registry, uptime-sorted)
 *  - the Piped wiki instance list (raw GitHub)
 * Best effort with a short timeout: discovery must never block playback.
 */
async function discoverInstances(): Promise<void> {
  if (discoveredAt && Date.now() - discoveredAt < DISCOVERY_TTL) return;
  discoveredAt = Date.now(); // set first: a slow fetch must not re-trigger
  const [invidious, piped] = await Promise.all([
    (async () => {
      try {
        const res = await fetchWithTimeout(
          "https://api.invidious.io/instances.json?sort_by=health",
          {},
          6000
        );
        if (!res.ok) return null;
        return parseInvidiousRegistry(await res.json()).slice(0, 8);
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const res = await fetchWithTimeout(
          "https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md",
          {},
          6000
        );
        if (!res.ok) return null;
        return parsePipedInstanceDoc(await res.text()).slice(0, 8);
      } catch {
        return null;
      }
    })(),
  ]);
  if (invidious && invidious.length) discoveredInvidious = invidious;
  if (piped && piped.length) discoveredPiped = piped;
}

async function tryPiped(base: string, videoId: string): Promise<StreamResult | null> {
  try {
    const res = await fetchWithTimeout(`${base}/streams/${videoId}`, {}, 8000);
    if (!res.ok) return null;
    const data = (await res.json()) as { audioStreams?: PipedAudioStream[] };
    const best = pickPipedAudio(data.audioStreams || []);
    if (!best?.url) return null;
    lastWorkingInstance = base;
    return {
      url: best.url,
      provider: `piped:${base.replace(/^https?:\/\//, "")}`,
      bitrate: best.bitrate,
      mime: String(best.mimeType || "audio/mp4").split(";")[0],
      // third-party host: run through the byte proxy (the server just
      // verified this instance responds, and the proxy can re-resolve)
      proxied: true,
    };
  } catch {
    return null;
  }
}

async function tryInvidious(base: string, videoId: string): Promise<StreamResult | null> {
  try {
    const res = await fetchWithTimeout(
      `${base}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
      {},
      8000
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { adaptiveFormats?: InvidiousFormat[] };
    const best = pickBestAudioFormat(data.adaptiveFormats || []);
    if (!best) return null;
    // local=true → the instance proxies googlevideo itself: the URL keeps
    // working even when the resolving IP differs from the streaming IP
    const url = buildAudioUrl(base, videoId, best);
    if (!url) return null;
    lastWorkingInstance = base;
    return {
      url,
      provider: `invidious:${base.replace(/^https?:\/\//, "")}`,
      bitrate: best.bitrate,
      mime: String(best.type || "audio/mp4").split(";")[0],
      // latest_version?local=true is the instance's own host (cross-origin
      // to the app) — stream it through the byte proxy
      proxied: true,
    };
  } catch {
    return null;
  }
}

export async function resolveStream(
  videoId: string,
  extraInstances?: string | null,
  opts?: { ytdlp?: boolean; fresh?: boolean }
): Promise<StreamResult> {
  const key = `stream:${videoId}:${extraInstances || ""}`;

  // success is worth 30 minutes (googlevideo URLs live ~6h); failure only
  // 20 seconds — a transient network hiccup or a gated InnerTube response
  // must not make a track unplayable for half an hour, which is what one
  // big TTL did.
  const MISS_TTL = 1000 * 20;
  const HIT_TTL = 1000 * 60 * 30;

  const hit = cacheGet<StreamResult>(key);
  // fresh: the byte proxy hit an expired/dead cached URL — re-run the
  // provider chain instead of handing back the same dead URL
  if (hit && !opts?.fresh) return hit;

  // one flight per key: a hover prefetch and the play click that follows
  // must not run the provider chain twice
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<StreamResult> => {
    // 1. InnerTube /player — one HTTPS POST, ~150-400 ms, direct URL
    //    (the Spotube strategy). Bot-gated IPs fall through quickly.
    const fast = await tryInnertube(videoId);
    if (fast) return fast;

    // 2. local yt-dlp — reliable on any IP but a process spawn (1-25 s)
    if (opts?.ytdlp !== false) {
      try {
        const r = await tryYtDlp(videoId);
        if (r) return r;
      } catch {
        /* next */
      }
    }

    // 3. the instance fleet — many Piped/Invidious instances in parallel,
    //    last-working first. Public instances are flaky, so racing them
    //    beats waiting for each 8-second timeout in sequence.
    await discoverInstances().catch(() => {});
    const userInstances = parseInstanceSetting(extraInstances);
    const piped = orderInstances(
      mergeInstanceLists(userInstances, discoveredPiped || DEFAULT_PIPED),
      lastWorkingInstance
    );
    const invidious = orderInstances(
      mergeInstanceLists(userInstances, discoveredInvidious || DEFAULT_INVIDIOUS),
      lastWorkingInstance
    );
    const races = [
      ...piped.map((base) => tryPiped(base, videoId)),
      ...invidious.map((base) => tryInvidious(base, videoId)),
    ];
    const first = await Promise.any(races).catch(() => null);
    if (first) return first;
    return { url: null, provider: null };
  })();

  inflight.set(key, task);
  try {
    const result = await task;
    cacheSet(key, result, result.url ? HIT_TTL : MISS_TTL);
    return result;
  } finally {
    if (inflight.get(key) === task) inflight.delete(key);
  }
}

/** shares one in-flight resolution between concurrent callers (see above) */
const inflight = new Map<string, Promise<StreamResult>>();
