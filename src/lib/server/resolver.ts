import { execFile } from "node:child_process";
import { cacheGet, cacheSet, fetchWithTimeout } from "./cache.ts";
import { resolveInnertubeStream } from "./innertube-stream";
import {
  buildAudioUrl,
  DEFAULT_INVIDIOUS,
  DEFAULT_PIPED,
  firstTruthy,
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
      { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
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
  // big TTL did. v1.7.1: failures are 2 minutes when the whole chain ran
  // (every provider answered "no") — a full-chain miss is expensive
  // (15 s+) and repeat clicks must not re-pay it on the same video.
  const MISS_TTL = 1000 * 20;
  const FULL_MISS_TTL = 1000 * 120;
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
    // 1. InnerTube /player — four clients raced in parallel, one round
    //    trip (~150-400 ms), direct URL. Bot-gated IPs fall through fast.
    const fast = await tryInnertube(videoId);
    if (fast) return fast;

    // 2. yt-dlp AND the instance fleet raced together. Running yt-dlp
    //    alone first cost its full 1-25 s on machines where it also fails
    //    (not bundled / gated) before the fleet even started — that delay
    //    in front of every track was the "app feels dead" experience.
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
    const races: Promise<StreamResult | null>[] = [];
    if (opts?.ytdlp !== false) races.push(tryYtDlp(videoId));
    races.push(
      ...piped.map((base) => tryPiped(base, videoId)),
      ...invidious.map((base) => tryInvidious(base, videoId))
    );
    const first = await firstTruthy(races);
    if (first) return first;
    return { url: null, provider: null };
  })();

  inflight.set(key, task);
  try {
    const result = await task;
    cacheSet(
      key,
      result,
      result.url ? HIT_TTL : opts?.fresh ? FULL_MISS_TTL : MISS_TTL
    );
    return result;
  } finally {
    if (inflight.get(key) === task) inflight.delete(key);
  }
}

/** shares one in-flight resolution between concurrent callers (see above) */
const inflight = new Map<string, Promise<StreamResult>>();

/* ------------------------------ diagnostics ------------------------------ */

export interface ProviderTrace {
  provider: string;
  ok: boolean;
  ms: number;
  detail: string;
}

/**
 * Run every provider independently and report what each returned — the
 * "why won't anything play" view. Bypasses the resolve cache (that is
 * the point); does not mutate lastWorkingInstance or the discovery cache.
 */
export async function diagnoseStream(
  videoId: string,
  extraInstances?: string | null
): Promise<{ videoId: string; at: string; providers: ProviderTrace[] }> {
  const at = new Date().toISOString();
  const providers: ProviderTrace[] = [];

  const time = async (name: string, fn: () => Promise<StreamResult | null>) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      providers.push({
        provider: name,
        ok: !!r?.url,
        ms: Date.now() - t0,
        detail: r?.url ? `${r.provider} · ${Math.round((r.bitrate || 0) / 1000)} kbps` : "no stream",
      });
    } catch (e) {
      providers.push({
        provider: name,
        ok: false,
        ms: Date.now() - t0,
        detail: e instanceof Error ? e.message.slice(0, 120) : "failed",
      });
    }
  };

  // InnerTube, client by client (which client is gated matters)
  const innertube = await import("./innertube-stream");
  const t0 = Date.now();
  const it = await innertube.resolveInnertubeStream(videoId).catch(() => null);
  providers.push({
    provider: "innertube (all clients)",
    ok: !!it?.url,
    ms: Date.now() - t0,
    detail: it?.url ? `${it.provider} · ${Math.round((it.bitrate || 0) / 1000)} kbps` : "gated or no formats",
  });

  await time("yt-dlp", () => tryYtDlp(videoId));

  await discoverInstances().catch(() => {});
  const userInstances = parseInstanceSetting(extraInstances);
  const piped = orderInstances(
    mergeInstanceLists(userInstances, discoveredPiped || DEFAULT_PIPED),
    null
  ).slice(0, 5);
  const invidious = orderInstances(
    mergeInstanceLists(userInstances, discoveredInvidious || DEFAULT_INVIDIOUS),
    null
  ).slice(0, 5);

  const fleet = await Promise.all([
    ...piped.map(async (base) => {
      const t = Date.now();
      try {
        const r = await tryPiped(base, videoId);
        return { provider: `piped:${base.replace(/^https?:\/\//, "")}`, ok: !!r?.url, ms: Date.now() - t, detail: r?.url ? "stream ok" : "no stream" } as ProviderTrace;
      } catch {
        return { provider: `piped:${base.replace(/^https?:\/\//, "")}`, ok: false, ms: Date.now() - t, detail: "unreachable" } as ProviderTrace;
      }
    }),
    ...invidious.map(async (base) => {
      const t = Date.now();
      try {
        const r = await tryInvidious(base, videoId);
        return { provider: `invidious:${base.replace(/^https?:\/\//, "")}`, ok: !!r?.url, ms: Date.now() - t, detail: r?.url ? "stream ok" : "no stream" } as ProviderTrace;
      } catch {
        return { provider: `invidious:${base.replace(/^https?:\/\//, "")}`, ok: false, ms: Date.now() - t, detail: "unreachable" } as ProviderTrace;
      }
    }),
  ]);
  providers.push(...fleet);

  return { videoId, at, providers };
}
