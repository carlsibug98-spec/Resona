// explicit .ts extension: this module is imported directly by node --test,
// which (unlike the bundler) needs the real file name
import { fetchWithTimeout } from "./cache.ts";

/**
 * Fast stream resolution straight from InnerTube's /player endpoint —
 * the same strategy Spotube and youtube_explode use. One HTTPS POST
 * (~150-400 ms) returns direct googlevideo audio URLs in the clear
 * (no signatureCipher), where the yt-dlp path costs a process spawn
 * (1-25 s) and public Piped/Invidious instances are usually dead.
 *
 * Client choice matters:
 * - ANDROID without `androidSdkVersion` ("sdkless") is the sweet spot:
 *   no PO-token enforcement, clean `url` fields. (ANDROID *with* the
 *   SDK version and IOS are PO-token gated in 2025+ and 403.)
 * - ANDROID_MUSIC only answers for the music catalog but shares the
 *   same freedom from PO tokens.
 * - WEB family is avoided: its formats come signatureCiphered.
 *
 * Bot gating ("Sign in to confirm you're not a bot") is IP-reputation
 * based; it mostly hits datacenter IPs. Resona resolves from the
 * listener's own machine, so the fast path is normally available —
 * when it isn't, callers fall back to the existing provider chain
 * (yt-dlp, Piped, Invidious) rather than erroring out.
 */

export interface InnertubeStream {
  url: string;
  bitrate: number;
  mime: string;
  provider: string;
}

interface PlayerFormat {
  mimeType?: string;
  bitrate?: number;
  url?: string;
  signatureCipher?: string;
  cipher?: string;
}

const PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

/** sdkless ANDROID — no androidSdkVersion, so no PO-token requirement */
const ANDROID_SDKLESS = {
  clientName: "ANDROID",
  clientVersion: "20.10.38",
  userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
  osName: "Android",
  osVersion: "11",
};

/** ANDROID_MUSIC — music-catalog client on the music host */
const ANDROID_MUSIC = {
  clientName: "ANDROID_MUSIC",
  clientVersion: "2.16.032",
  userAgent:
    "com.google.android.apps.youtube.music/2.16.032 (Linux; U; Android 11) gzip",
  osName: "Android",
  osVersion: "11",
};

/** the fast-path clients, tried in order */
const CLIENTS: { name: string; client: Record<string, unknown> }[] = [
  { name: "android-sdkless", client: ANDROID_SDKLESS },
  { name: "android-music", client: ANDROID_MUSIC },
];

/**
 * Pick the best audio-only format: highest-bitrate audio/mp4 (the <audio>
 * element skips codecs fine, but mp4/m4a starts fastest in Chromium), then
 * audio/webm as second choice. Ciphered formats are skipped — decoding the
 * `s` parameter requires the player JS and is exactly the slow path this
 * module exists to avoid.
 */
function pickAudioFormat(fmts: PlayerFormat[]): PlayerFormat | null {
  const clean = fmts.filter((f) => f.url && String(f.mimeType || "").startsWith("audio/"));
  if (!clean.length) return null;
  const score = (f: PlayerFormat) =>
    (String(f.mimeType).includes("audio/mp4") ? 1_000_000 : 0) + (f.bitrate || 0);
  return clean.sort((a, b) => score(b) - score(a))[0];
}

async function playerOnce(
  videoId: string,
  client: Record<string, unknown>,
  timeoutMs: number
): Promise<PlayerFormat[] | null> {
  const res = await fetchWithTimeout(
    PLAYER_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": String(client.userAgent || ""),
        Origin: "https://www.youtube.com",
      },
      body: JSON.stringify({
        context: { client: { ...client, hl: "en", gl: "US" } },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    },
    timeoutMs
  );
  if (!res.ok) return null;
  const data: any = await res.json();
  const status = data?.playabilityStatus?.status;
  // LOGIN_REQUIRED = bot gate / age gate on this IP; OK is the only state
  // that reliably carries stream URLs
  if (status !== "OK") return null;
  const fmts = data?.streamingData?.adaptiveFormats;
  return Array.isArray(fmts) ? (fmts as PlayerFormat[]) : null;
}

/**
 * Resolve a direct audio URL via InnerTube. Returns null quickly (well
 * under a second for both clients) when YouTube gates the request, so the
 * caller can move on to the fallback providers without paying for a long
 * timeout. A successful result is cached by the caller.
 */
export async function resolveInnertubeStream(
  videoId: string,
  opts?: { timeoutMs?: number }
): Promise<InnertubeStream | null> {
  const timeoutMs = opts?.timeoutMs ?? 2500;
  for (const { name, client } of CLIENTS) {
    try {
      const fmts = await playerOnce(videoId, client, timeoutMs);
      if (!fmts) continue;
      const best = pickAudioFormat(fmts);
      if (!best?.url) continue;
      return {
        url: best.url,
        bitrate: best.bitrate || 128_000,
        mime: String(best.mimeType || "audio/mp4").split(";")[0],
        provider: `innertube:${name}`,
      };
    } catch {
      /* try the next client */
    }
  }
  return null;
}
