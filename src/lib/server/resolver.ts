import { execFile } from "node:child_process";
import { cacheGet, cacheSet, fetchWithTimeout } from "./cache.ts";
import { resolveInnertubeStream } from "./innertube-stream";



export interface StreamResult {
  url: string | null;
  provider: string | null;
  bitrate?: number;
  mime?: string;
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
 * player clients automatically) — public Piped/Invidious instances
 * frequently die, so this one goes first.
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

const DEFAULT_PIPED = [
  "https://pipedapi.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.ducks.party",
];

const DEFAULT_INVIDIOUS = [
  "https://iv.melmac.space",
  "https://invidious.materialio.us",
];

function parseInstances(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\//.test(s));
}

async function tryPiped(base: string, videoId: string): Promise<StreamResult | null> {
  const res = await fetchWithTimeout(`${base}/streams/${videoId}`, {}, 8000);
  if (!res.ok) return null;
  const data = await res.json();
  const audios = (data.audioStreams || []).filter((a: any) => a.url);
  if (!audios.length) return null;
  const best = audios.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  return {
    url: best.url,
    provider: `piped:${base.replace(/^https?:\/\//, "")}`,
    bitrate: best.bitrate,
    mime: best.mimeType,
  };
}

async function tryInvidious(base: string, videoId: string): Promise<StreamResult | null> {
  const res = await fetchWithTimeout(
    `${base}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
    {},
    8000
  );
  if (!res.ok) return null;
  const data = await res.json();
  const audios = (data.adaptiveFormats || []).filter(
    (f: any) => String(f.type || "").startsWith("audio") && f.url
  );
  if (!audios.length) return null;
  const best = audios.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  return {
    url: best.url,
    provider: `invidious:${base.replace(/^https?:\/\//, "")}`,
    bitrate: best.bitrate,
    mime: best.type,
  };
}

export async function resolveStream(
  videoId: string,
  extraInstances?: string | null,
  opts?: { ytdlp?: boolean }
): Promise<StreamResult> {
  const key = `stream:${videoId}:${extraInstances || ""}`;

  // success is worth 30 minutes (googlevideo URLs live ~6h); failure only
  // 20 seconds — a transient network hiccup or a gated InnerTube response
  // must not make a track unplayable for half an hour, which is what one
  // big TTL did.
  const MISS_TTL = 1000 * 20;
  const HIT_TTL = 1000 * 60 * 30;

  const hit = cacheGet<StreamResult>(key);
  if (hit) return hit;

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
    // 3. Piped + Invidious in parallel — public instances are flaky, so
    //    racing them beats waiting for each 8 s timeout in sequence
    const piped = [...parseInstances(extraInstances), ...DEFAULT_PIPED];
    const invidious = [...parseInstances(extraInstances), ...DEFAULT_INVIDIOUS];
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
