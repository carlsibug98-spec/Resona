import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cacheSet, fetchWithTimeout } from "@/lib/server/cache";
import { APP_VERSION, RELEASES_URL, isNewerVersion, normalizeVersion } from "@/lib/version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LatestRelease {
  version: string;
  url: string;
  publishedAt: string | null;
  notes: string | null;
}

const CACHE_KEY = "github:latest-release";

/** primary: the GitHub API */
async function fetchFromApi(): Promise<LatestRelease | null> {
  const res = await fetchWithTimeout(
    "https://api.github.com/repos/carlsibug98-spec/Resona/releases/latest",
    { headers: { Accept: "application/vnd.github+json" } },
    10000
  );
  if (!res.ok) return null;
  const d = (await res.json()) as {
    tag_name?: string;
    html_url?: string;
    published_at?: string;
    body?: string;
  };
  const version = normalizeVersion(d.tag_name || "");
  if (!version) return null;
  return {
    version,
    url: d.html_url || RELEASES_URL,
    publishedAt: d.published_at || null,
    notes: d.body ? d.body.slice(0, 2000) : null,
  };
}

/** fallback: the public releases atom feed (no rate limit) */
async function fetchFromAtom(): Promise<LatestRelease | null> {
  const res = await fetchWithTimeout(
    "https://github.com/carlsibug98-spec/Resona/releases.atom",
    {},
    10000
  );
  if (!res.ok) return null;
  const xml = await res.text();
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entry) return null;
  const id = entry[1].match(/<id>[^<]*\/v([^<]+)<\/id>/);
  const updated = entry[1].match(/<updated>([^<]+)<\/updated>/);
  const version = id ? normalizeVersion(id[1]) : "";
  if (!version) return null;
  return {
    version,
    url: RELEASES_URL,
    publishedAt: updated ? updated[1] : null,
    notes: null,
  };
}

async function fetchLatestRelease(fresh: boolean): Promise<LatestRelease | null> {
  if (!fresh) {
    const hit = cacheGet<LatestRelease>(CACHE_KEY);
    if (hit) return hit;
  }
  const release =
    (await fetchFromApi().catch(() => null)) ?? (await fetchFromAtom().catch(() => null));
  if (release) cacheSet(CACHE_KEY, release, 1000 * 60 * 60);
  return release;
}

/**
 * Version info for the update banner: what we are, what's newest on GitHub,
 * and whether an update is available. Cached for an hour server-side;
 * `?fresh=1` bypasses it for manual "Check for updates" clicks.
 */
export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const latest = await fetchLatestRelease(fresh).catch(() => null);
  return NextResponse.json({
    version: APP_VERSION,
    releasesUrl: RELEASES_URL,
    latest,
    updateAvailable: latest ? isNewerVersion(APP_VERSION, latest.version) : false,
  });
}
