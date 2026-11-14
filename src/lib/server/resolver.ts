import { cached, cacheGet, cacheSet, fetchWithTimeout } from "./cache";
import {
  buildAudioUrl,
  mergeInstanceLists,
  orderInstances,
  pickBestAudioFormat,
} from "@/lib/instance-fleet";
import { ensureYtDlp, getYtDlpStatus, resolveWithYtDlp } from "./ytdlp";

export interface StreamResult {
  url: string | null;
  provider: string | null;
  bitrate?: number;
  mime?: string;
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

/** OpenSpot's remotely-updated instance list — refreshed every 10 minutes */
const OPENSPOT_CONFIG =
  "https://raw.githubusercontent.com/BlackHatDevX/openspot-config/refs/heads/main/ytmusicextraapi.json";

/** the official Invidious registry */
const INVIDIOUS_REGISTRY = "https://api.invidious.io/instances.json?sort_by=type,users";

const FLEET_TTL_MS = 1000 * 60 * 30;

function parseInstances(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

let lastWorkingInstance: string | null = null;

/** dynamic fallback fleet, in the spirit of OpenSpot's discovery chain */
async function getFleet(extraInstances?: string | null): Promise<string[]> {
  const user = parseInstances(extraInstances);
  return cached("instance-fleet", FLEET_TTL_MS, async () => {
    const fromConfig: string[] = [];
    const fromRegistry: string[] = [];

    try {
      const res = await fetchWithTimeout(OPENSPOT_CONFIG, {}, 8000);
      if (res.ok) {
        const cfg = (await res.json()) as {
          ytmusic_extra_apis?: { url?: string }[];
        };
        for (const api of cfg.ytmusic_extra_apis || []) {
          if (api.url) fromConfig.push(api.url);
        }
      }
    } catch {
      /* list is optional */
    }

    try {
      const res = await fetchWithTimeout(INVIDIOUS_REGISTRY, {}, 8000);
      if (res.ok) {
        const list = (await res.json()) as [
          string,
          { api?: boolean; type?: string; uri?: string }
        ][];
        for (const [, info] of list || []) {
          if (info?.api && info.type === "https" && info.uri && !info.uri.includes(".onion")) {
            fromRegistry.push(info.uri);
          }
        }
      }
    } catch {
      /* registry is optional */
    }

    return mergeInstanceLists(fromConfig, fromRegistry, DEFAULT_INVIDIOUS);
  }).then((fleet) => mergeInstanceLists(user, fleet)); // user instances always first
}

async function tryInvidious(base: string, videoId: string): Promise<StreamResult | null> {
  const res = await fetchWithTimeout(
    `${base}/api/v1/videos/${encodeURIComponent(videoId)}?fields=adaptiveFormats`,
    {},
    8000
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { adaptiveFormats?: any[] };
  const best = pickBestAudioFormat(data.adaptiveFormats || []);
  if (!best) return null;
  const url = buildAudioUrl(base, videoId, best);
  if (!url) return null;
  return {
    url,
    provider: `invidious:${base.replace(/^https?:\/\//, "")}`,
    bitrate: best.bitrate,
    // the local-redirect endpoint serves the same bytes as the format
    mime: String(best.type || "").split(";")[0] || "audio/mp4",
  };
}

async function tryPiped(base: string, videoId: string): Promise<StreamResult | null> {
  const res = await fetchWithTimeout(`${base}/streams/${encodeURIComponent(videoId)}`, {}, 8000);
  if (!res.ok) return null;
  const data = (await res.json()) as { audioStreams?: any[] };
  const audios = (data.audioStreams || []).filter((a) => a.url);
  if (!audios.length) return null;
  const best = audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  return {
    url: best.url,
    provider: `piped:${base.replace(/^https?:\/\//, "")}`,
    bitrate: best.bitrate,
    mime: best.mimeType,
  };
}

/** in-flight resolves, so a play + download at the same time share one pass */
const inFlight = new Map<string, Promise<StreamResult>>();

export async function resolveStream(
  videoId: string,
  extraInstances?: string | null
): Promise<StreamResult> {
  const key = `stream:${videoId}:${extraInstances || ""}`;
  const hit = cacheGet<StreamResult>(key);
  if (hit && hit.url) return hit;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = (async (): Promise<StreamResult> => {
    // 1. yt-dlp — bundled, auto-provisioned, or on PATH
    const ytdlp = await resolveWithYtDlp(videoId);
    if (ytdlp.ok && ytdlp.url) {
      return {
        url: ytdlp.url,
        provider: "yt-dlp",
        bitrate: 128_000,
        mime: "audio/mp4",
      } satisfies StreamResult;
    }

    // 2. the instance fleet — user instances first, then discovered ones.
    //    Capped so a dead fleet can't add a minute of timeouts to a miss.
    const fleet = await getFleet(extraInstances);
    const ordered = orderInstances(fleet, lastWorkingInstance).slice(0, 6);
    for (const base of ordered) {
      try {
        const r = await tryInvidious(base, videoId);
        if (r) {
          lastWorkingInstance = base;
          return r;
        }
      } catch {
        /* next */
      }
    }

    // 3. Piped APIs (user instances + the old defaults)
    const piped = mergeInstanceLists(
      parseInstances(extraInstances),
      DEFAULT_PIPED
    );
    for (const base of piped) {
      try {
        const r = await tryPiped(base, videoId);
        if (r) return r;
      } catch {
        /* next */
      }
    }

    return { url: null, provider: null } satisfies StreamResult;
  })();

  inFlight.set(key, job);
  try {
    const result = await job;
    // only successful resolves enter the 30-minute cache — a miss must be
    // retryable right away (e.g. after yt-dlp finishes provisioning)
    if (result.url) cacheSet(key, result, 1000 * 60 * 30);
    return result;
  } finally {
    inFlight.delete(key);
  }
}

export interface DownloadCapability {
  /** "ytdlp" (best), "instances" (fallback fleet) or "none" */
  provider: "ytdlp" | "instances" | "none";
  /** true while yt-dlp is being downloaded for the first time */
  provisioning: boolean;
  version?: string;
}

/**
 * Cheap capability check for the UI. Never resolves a stream — it only
 * reports whether the download button should exist and what backs it.
 */
export async function getDownloadCapability(): Promise<DownloadCapability> {
  const status = getYtDlpStatus();
  if (status.state === "ready") {
    return { provider: "ytdlp", provisioning: false, version: status.version };
  }
  // kick provisioning in the background if it hasn't started
  void ensureYtDlp().catch(() => {});
  if (status.state === "provisioning" || status.state === "unknown") {
    return { provider: "none", provisioning: true };
  }
  // yt-dlp failed (no GitHub access?) — the instance fleet is the fallback
  const fleet = await getFleet(null);
  return { provider: fleet.length ? "instances" : "none", provisioning: false };
}
