// explicit .ts extension: this module is imported directly by node --test,
// which (unlike the bundler) needs the real file name
import { fetchWithTimeout, verifyAudioUrl } from "./cache.ts";

/**
 * Fast stream resolution straight from InnerTube's /player endpoint —
 * the same strategy Spotube and youtube_explode use. One HTTPS POST
 * (~150-400 ms) returns direct googlevideo audio URLs in the clear
 * (no signatureCipher), where the yt-dlp path costs a process spawn
 * (1-25 s) and public Piped/Invidious instances are usually dead.
 *
 * v1.7.3 — the request PATTERN changed, per the Musify comparison that
 * diagnosed the "some tracks never play" report:
 *
 * The v1.7.0-1.7.2 code raced 4 clients in PARALLEL (firstTruthy) — 4+
 * simultaneous /player POSTs per track, repeated per track change. The
 * batch repro proved YouTube answers that burst by bot-gating the IP
 * ("Sign in to confirm you're not a bot"): track 1 resolved in ~280 ms,
 * every later track came back gated in <100 ms. Musify (4.4k★, youtube_
 * explode_dart) never trips this because it goes client by client in a
 * sequential loop, one POST in flight at a time, with a retry per client
 * and a HEAD-check of the resulting URL — so Resona does the same now:
 *
 * 1. SEQUENTIAL ladder (vr → sdkless → music → tv-embed). One POST per
 *    track on the happy path; the remaining clients are only asked when
 *    the earlier one fails.
 * 2. RETRY ONCE per client on network errors (Musify's retry() pattern).
 * 3. IP-WIDE GATE only when EVERYTHING gates: live probing shows the bot
 *    gate flaps per request (one track gated, the next fine seconds
 *    later), so one gated answer doesn't stop the walk — the ladder
 *    continues and often the next client passes. Only when all three
 *    clients answer "confirm you're not a bot" does Resona back off
 *    InnerTube entirely for 10 minutes (the caller's fallback chain —
 *    yt-dlp, the instance fleet — takes over), because POSTing into a
 *    fully-gated IP only deepens the gate.
 * 4. VERIFY with the minting client's UA: googlevideo ties app-client
 *    URLs to the identity that minted them — probing with a different
 *    UA rejects valid URLs, and PLAYING them from the <audio> element
 *    (which sends Chrome's UA) 403s. So Resona probes with the client's
 *    UA and marks results proxied (resolver), playing the bytes through
 *    /api/stream, which presents the stored UA — Musify's exact
 *    discipline ("headers must match the client that obtained the URL")
 *    adapted to a browser that cannot set request headers on media.
 *    If the top format is dead the next formats of the same client
 *    answer are tried before moving on — "top itag dead, lower itag
 *    live" happens.
 *
 * Client choice matters (versions verified against Musify's bundled
 * youtube_explode, which tracks yt-dlp's client deprecations):
 * - ANDROID_VR: no PO-token enforcement, serves embed-disabled videos
 *   (cobalt's go-to client) — first in the ladder, it won most batch
 *   repro resolves.
 * - ANDROID without `androidSdkVersion` ("sdkless"): no PO-token
 *   enforcement, clean `url` fields.
 * - TVHTML5 (Cobalt, 7.20260707.07.00): the TV stack YouTube still
 *   serves; answers for embed-restricted videos too.
 * - Dropped as dead weight (deprecated upstream, rejected in live
 *   probes): ANDROID_MUSIC (400) and TVHTML5_SIMPLY_EMBEDDED_PLAYER
 *   ("YouTube is no longer supported in this application").
 * - WEB family is avoided: its formats come signatureCiphered.
 */

export interface InnertubeStream {
  url: string;
  bitrate: number;
  mime: string;
  provider: string;
  /** the User-Agent of the client that MINTED this URL. googlevideo ties
   * app-client URLs to that identity — any later fetch (proxy, download)
   * must present the same UA or it reliably 403s (Musify's
   * youtube_explode documents this as the #1 "returned 403" cause). */
  ua: string;
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

/**
 * ANDROID_VR — the Quest browser client. No PO-token enforcement, and it
 * is served streams even for videos whose uploader disabled embedding
 * (the cobalt project's go-to client for exactly that case).
 */
const ANDROID_VR = {
  clientName: "ANDROID_VR",
  clientVersion: "1.62.27",
  deviceMake: "Oculus",
  deviceModel: "Quest 3",
  userAgent: "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12; eureka-user Build/SQ3A.220705.004) gzip",
  osName: "Android",
  osVersion: "12",
  androidSdkVersion: 32,
};

/**
 * TVHTML5 (Cobalt) — the TV stack YouTube still serves. Taken verbatim
 * from Musify's bundled youtube_explode (their `tv` client, the working
 * replacement for the deprecated TVHTML5_SIMPLY_EMBEDDED_PLAYER, which
 * now answers "YouTube is no longer supported in this application").
 * It answers for embed-restricted videos too.
 */
const TVHTML5_TV = {
  clientName: "TVHTML5",
  clientVersion: "7.20260707.07.00",
  userAgent:
    "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
  hl: "en",
  timeZone: "UTC",
  gl: "US",
  utcOffsetMinutes: 0,
  originalUrl: "https://www.youtube.com/tv",
  theme: "CLASSIC",
  platform: "DESKTOP",
  clientFormFactor: "UNKNOWN_FORM_FACTOR",
  webpSupport: false,
  configInfo: {},
  tvAppInfo: { appQuality: "TV_APP_QUALITY_FULL_ANIMATION" },
  acceptHeader:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/** extra body context per client (the TV client carries user/request) */
const CLIENT_EXTRAS: Record<string, Record<string, unknown>> = {
  tv: {
    user: { lockedSafetyMode: false },
    request: { useSsl: true },
  },
};

/** the ladder — tried strictly one at a time, first verified answer wins */
const CLIENTS: { name: string; client: Record<string, unknown> }[] = [
  { name: "android-vr", client: ANDROID_VR },
  { name: "android-sdkless", client: ANDROID_SDKLESS },
  { name: "tv", client: TVHTML5_TV },
];

/**
 * IP-wide bot gate. playability LOGIN_REQUIRED is not per-video — the
 * batch repro showed later tracks gating in <100 ms, i.e. YouTube gates
 * the IP for a while. While active, resolveInnertubeStream posts
 * NOTHING (a burst into a gated IP only extends it) and the caller's
 * fallback chain takes over.
 *
 * v1.7.4 — ESCALATING, not instant-blackout: live probing shows the gate
 * FLAPS per request on residential IPs (one track gated, the next fine
 * seconds later). The old flat 10-minute blackout turned one unlucky
 * track — three gated ladder answers in a row — into "nothing plays for
 * ten minutes" while the gate had already lifted. Now each consecutive
 * full-gate doubles the backoff (30 s → 1 m → 2 m → 5 m, capped), and
 * any ladder that gets ANY non-gated answer (success, 4xx, network
 * error) resets the escalation. The cap stays at 5 minutes: probing a
 * hard-gated datacenter IP deeper only entrenches it.
 */
const GATE_STEPS_MS = [30_000, 60_000, 120_000, 300_000];
let gateUntil = 0;
let gateLevel = 0;

/** test hook / diagnostics: is the IP-wide InnerTube gate active? */
export function innertubeGateActive(): boolean {
  return Date.now() < gateUntil;
}

/** test hook: reset the gate between tests */
export function innertubeGateReset(): void {
  gateUntil = 0;
  gateLevel = 0;
}

/**
 * Pick the best audio-only formats, highest-bitrate audio/mp4 first (the
 * <audio> element skips codecs fine, but mp4/m4a starts fastest in
 * Chromium), then audio/webm. Ciphered formats are skipped — decoding
 * the `s` parameter requires the player JS and is exactly the slow path
 * this module exists to avoid. Returns the sorted candidates so the
 * caller can fall through to the next format when one is dead.
 */
function audioFormatCandidates(fmts: PlayerFormat[]): PlayerFormat[] {
  const clean = fmts.filter((f) => f.url && String(f.mimeType || "").startsWith("audio/"));
  const score = (f: PlayerFormat) =>
    (String(f.mimeType).includes("audio/mp4") ? 1_000_000 : 0) + (f.bitrate || 0);
  return clean.sort((a, b) => score(b) - score(a));
}

type PlayerOutcome = { status: string; reason: string; fmts: PlayerFormat[] | null };

async function playerOnce(
  videoId: string,
  client: Record<string, unknown>,
  timeoutMs: number,
  extras?: Record<string, unknown>
): Promise<PlayerOutcome> {
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
        context: { client: { ...client, hl: "en", gl: "US" }, ...(extras || {}) },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    },
    timeoutMs
  );
  if (!res.ok) return { status: `http:${res.status}`, reason: "", fmts: null };
  const data: any = await res.json();
  const status = String(data?.playabilityStatus?.status || "UNKNOWN");
  const reason = String(data?.playabilityStatus?.reason || "");
  // OK is the only state that reliably carries stream URLs
  const fmts = status === "OK" ? data?.streamingData?.adaptiveFormats : null;
  return {
    status,
    reason,
    fmts: Array.isArray(fmts) ? (fmts as PlayerFormat[]) : null,
  };
}

async function tryClient(
  videoId: string,
  name: string,
  client: Record<string, unknown>,
  timeoutMs: number
): Promise<{ stream: InnertubeStream | null; botGated: boolean }> {
  let outcome: PlayerOutcome;
  try {
    outcome = await playerOnce(videoId, client, timeoutMs, CLIENT_EXTRAS[name]);
  } catch {
    // one retry on a network-level error (Musify's retry() pattern) —
    // a transient reset shouldn't burn a whole client
    try {
      outcome = await playerOnce(videoId, client, timeoutMs, CLIENT_EXTRAS[name]);
    } catch {
      return { stream: null, botGated: false };
    }
  }
  // the IP-wide bot gate has a specific signature — LOGIN_REQUIRED with
  // "not a bot" in the reason. LOGIN_REQUIRED with "confirm your age" is
  // per-VIDEO (age-restricted), not the IP: gating all of InnerTube for
  // 10 minutes over one age-gated track would be a self-inflicted wound.
  const botGated = outcome.status === "LOGIN_REQUIRED" && /not a bot/i.test(outcome.reason);
  if (botGated) return { stream: null, botGated };
  if (!outcome.fmts) return { stream: null, botGated: false };
  // verify top formats in bitrate order until one serves bytes — a client
  // that answers OK can still hand out a URL that 403s the moment it is
  // fetched, and sometimes only the top itag is dead. The probe MUST use
  // the minting client's UA (see InnertubeStream.ua)
  for (const f of audioFormatCandidates(outcome.fmts).slice(0, 3)) {
    if (!(await verifyAudioUrl(f.url as string, 5000, String(client.userAgent || "")))) continue;
    return {
      stream: {
        url: f.url as string,
        bitrate: f.bitrate || 128_000,
        mime: String(f.mimeType || "audio/mp4").split(";")[0],
        provider: `innertube:${name}`,
        ua: String(client.userAgent || ""),
      },
      botGated: false,
    };
  }
  return { stream: null, botGated: false };
}

/**
 * Resolve a direct audio URL via InnerTube, walking the client ladder
 * SEQUENTIALLY — first verified answer wins and no further clients are
 * asked. Returns null when every client is gated or dead-URL, so the
 * caller can move on to the fallback providers. A successful result is
 * cached by the caller.
 */
export async function resolveInnertubeStream(
  videoId: string,
  opts?: { timeoutMs?: number }
): Promise<InnertubeStream | null> {
  const timeoutMs = opts?.timeoutMs ?? 4000;
  if (innertubeGateActive()) return null;
  // Live evidence (sandbox batch repro): the bot gate FLAPS per request —
  // one track's POST comes back "confirm you're not a bot" and the next
  // track's resolves fine seconds later. So a single gated answer must
  // NOT stop the ladder (the next client often passes) — walk it fully,
  // Musify-style, and only treat the gate as IP-wide when EVERY client
  // came back gated: then further POSTs only deepen the gate and the
  // caller's fallback chain takes over for a while (escalating, see
  // GATE_STEPS_MS).
  let gatedClients = 0;
  for (const { name, client } of CLIENTS) {
    const { stream, botGated } = await tryClient(videoId, name, client, timeoutMs);
    if (stream) {
      // any success also proves the gate is gone — reset the escalation
      gateLevel = 0;
      return stream;
    }
    if (botGated) gatedClients++;
  }
  if (gatedClients === CLIENTS.length && gatedClients > 0) {
    const ms = GATE_STEPS_MS[Math.min(gateLevel, GATE_STEPS_MS.length - 1)];
    gateLevel = Math.min(gateLevel + 1, GATE_STEPS_MS.length - 1);
    gateUntil = Date.now() + ms;
  } else {
    // mixed outcome (some client answered non-gated): the IP is not
    // fully gated — keep the ladder cheap for the next track
    gateLevel = 0;
  }
  return null;
}
