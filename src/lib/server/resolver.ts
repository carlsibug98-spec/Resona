import { execFile } from "node:child_process";
import { cached, fetchWithTimeout } from "./cache";

 

export interface StreamResult {
  url: string | null;
  provider: string | null;
  bitrate?: number;
  mime?: string;
}

const YTDLP_BIN = process.env.YTDLP_PATH || "yt-dlp";

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
  return cached(`stream:${videoId}:${extraInstances || ""}`, 1000 * 60 * 30, async () => {
    const piped = [...parseInstances(extraInstances), ...DEFAULT_PIPED];
    const invidious = [...parseInstances(extraInstances), ...DEFAULT_INVIDIOUS];

    if (opts?.ytdlp !== false) {
      try {
        const r = await tryYtDlp(videoId);
        if (r) return r;
      } catch {
        /* next */
      }
    }
    for (const base of piped) {
      try {
        const r = await tryPiped(base, videoId);
        if (r) return r;
      } catch {
        /* next */
      }
    }
    for (const base of invidious) {
      try {
        const r = await tryInvidious(base, videoId);
        if (r) return r;
      } catch {
        /* next */
      }
    }
    return { url: null, provider: null };
  });
}
