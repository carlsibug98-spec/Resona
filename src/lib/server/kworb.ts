import type { Track } from "@/lib/types";
// explicit .ts extensions: node --test imports this module directly
import { cached, fetchWithTimeout, mapPool } from "./cache.ts";
import { getChartsTrending, searchOne } from "./innertube.ts";


const TRENDING_URL = "https://kworb.net/youtube/trending.html";
const INDEX_URL = "https://kworb.net/youtube/";

interface KworbRow {
  rank: number;
  movement: string;
  title: string;
  countries: { name: string; pos: number }[];
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function cleanQuery(title: string): string {
  return title
    .replace(/\((official\s+)?(music\s+)?(video|audio|mv|visualizer|lyrics?(\s+video)?)\)/gi, "")
    .replace(/\[(official\s+)?(music\s+)?(video|audio|mv|4k|hd)\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchKworb(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {}, 12000);
  if (!res.ok) throw new Error(`kworb ${res.status}`);
  return res.text();
}

export function parseKworbRows(html: string): KworbRow[] {
  const rows: KworbRow[] = [];
  const trs = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  let rank = 0;
  for (const tr of trs) {
    const cells = (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map(stripTags);
    if (cells.length < 4) continue;
    const title = cells[2];
    if (!title) continue;
    rank++;
    const countries: { name: string; pos: number }[] = [];
    const annot = cells[4] || "";
    for (const m of annot.matchAll(/#(\d+)\s+([A-Za-zÀ-ÿ\u00C0-\u024F'&.\s]+?)(?=,|#|$)/g)) {
      countries.push({ pos: parseInt(m[1], 10), name: m[2].trim() });
    }
    rows.push({ rank, movement: cells[1] || "", title, countries });
  }
  return rows;
}

/** kworb trending rows. An empty parse throws (instead of caching an
 * empty list for 3 hours) so a broken kworb response is retried on the
 * next request and the charts fallback can take over. */
async function getTrendingRows(): Promise<KworbRow[]> {
  return cached("kworb:trending", 1000 * 60 * 60 * 3, async () => {
    const html = await fetchKworb(TRENDING_URL);
    const rows = parseKworbRows(html);
    if (!rows.length) throw new Error("kworb: chart page parsed to no rows");
    return rows;
  });
}

/** Regions from kworb annotations. kworb being down must never sink the
 * whole /api/trending response — worst case only "Global" is offered. */
export async function getRegions(): Promise<string[]> {
  try {
    const rows = await getTrendingRows();
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const c of row.countries) {
        counts.set(c.name, (counts.get(c.name) || 0) + 1);
      }
    }
    const regions = [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 80);
    return ["Global", ...regions];
  } catch {
    return ["Global"];
  }
}

export interface TrendingEntry {
  rank: number;
  movement: string;
  title: string;
  track: Track;
}

/** where the trending rows came from — surfaced so the UI can explain
 * itself instead of showing an inexplicably empty shelf */
export type TrendingSource = "kworb" | "charts";

export interface TrendingResult {
  entries: TrendingEntry[];
  source: TrendingSource;
}

/** flattened view over the detailed result — just the playable tracks */
export async function getTrending(region = "Global", limit = 40): Promise<{
  tracks: Track[];
  source: TrendingSource;
}> {
  const { entries, source } = await getTrendingDetailed(region, limit);
  return { tracks: entries.map((e) => e.track), source };
}

/** per-query micro-cache so overlapping passes (trending view, home
 * catalog) never resolve the same cleaned title twice within 30 min */
async function resolveRow(query: string): Promise<Track | null> {
  const key = `kworb:q:${query}`;
  const hit = await cached(key, 1000 * 60 * 30, async () => {
    let t = await searchOne(query, "videos");
    if (!t) t = await searchOne(query, "songs");
    return t as Track | null;
  });
  return hit ?? null;
}

async function resolveKworbRows(region: string, limit: number): Promise<TrendingEntry[]> {
  const rows = await getTrendingRows();
  let selected = rows.slice(0, limit);
  if (region !== "Global") {
    const regionRows = rows.filter((r) =>
      r.countries.some((c) => c.name === region)
    );
    regionRows.sort((a, b) => {
      const pa = Math.min(...a.countries.filter((c) => c.name === region).map((c) => c.pos));
      const pb = Math.min(...b.countries.filter((c) => c.name === region).map((c) => c.pos));
      return pa - pb;
    });
    selected = regionRows.slice(0, limit);
  }
  if (!selected.length) selected = rows.slice(0, limit);

  const resolved = new Map<number, Track | null>();
  await mapPool(selected, 6, async (r) => {
    resolved.set(r.rank, await resolveRow(cleanQuery(r.title)));
  });

  const out: TrendingEntry[] = [];
  const seen = new Set<string>();
  for (const r of selected) {
    const t = resolved.get(r.rank);
    if (t && !seen.has(t.videoId)) {
      seen.add(t.videoId);
      out.push({ rank: r.rank, movement: r.movement, title: r.title, track: t });
    }
  }
  return out;
}

const MIN_STRENGTH = 5;

/** Ranked trending rows, resolved to real playable tracks.
 *
 * Never-empty contract:
 * 1. kworb chart rows resolved through YouTube Music search (cached 6h —
 *    but a result weaker than MIN_STRENGTH entries is NOT cached; one bad
 *    pass can no longer blank the shelves for hours);
 * 2. kworb unreachable / weak → YouTube Charts pages (browse
 *    FEmusic_charts → chart page playlist), the same keyless pipeline,
 *    cached 1h;
 * 3. charts unreachable too → throws, and the route answers 502 so the
 *    UI can show an honest retry instead of a fake-empty shelf. */
export async function getTrendingDetailed(
  region = "Global",
  limit = 40
): Promise<TrendingResult> {
  try {
    const entries = await cached(
      `kworb:detailed:${region}:${limit}`,
      1000 * 60 * 60 * 6,
      async () => {
        const out = await resolveKworbRows(region, limit);
        if (out.length < Math.min(MIN_STRENGTH, limit)) {
          throw new Error("kworb: resolved too few rows to cache");
        }
        return out;
      }
    );
    return { entries, source: "kworb" };
  } catch (kworbErr) {
    console.warn(
      "trending: kworb unavailable (%s) — falling back to YouTube Charts",
      kworbErr instanceof Error ? kworbErr.message : kworbErr
    );
    const entries = await cached(
      `charts:trending:${region}:${limit}`,
      1000 * 60 * 60,
      async () => {
        const tracks = await getChartsTrending(Math.max(limit, 40));
        const out: TrendingEntry[] = tracks.map((t, i) => ({
          rank: i + 1,
          movement: "",
          title: t.artist && t.artist !== "Unknown artist" ? `${t.artist} — ${t.title}` : t.title,
          track: t,
        }));
        if (!out.length) throw new Error("charts: no entries");
        return out;
      }
    );
    return { entries, source: "charts" };
  }
}

export async function getDailyTop(limit = 40): Promise<Track[]> {
  return cached(`kworb:daily:${limit}`, 1000 * 60 * 60 * 3, async () => {
    const html = await fetchKworb(INDEX_URL);
    const rows = parseKworbRows(html);
    const selected = rows.slice(0, limit);
    const resolved = new Map<string, Track | null>();
    await mapPool(
      selected.map((r) => ({ key: String(r.rank), query: cleanQuery(r.title), filter: "videos" as const })),
      4,
      async (q) => {
        let t = await searchOne(q.query, "videos");
        if (!t) t = await searchOne(q.query, "songs");
        resolved.set(q.key, t);
      }
    );
    const tracks: Track[] = [];
    const seen = new Set<string>();
    for (const r of selected) {
      const t = resolved.get(String(r.rank));
      if (t && !seen.has(t.videoId)) {
        seen.add(t.videoId);
        tracks.push(t);
      }
    }
    if (!tracks.length) throw new Error("kworb: daily top resolved to no tracks");
    return tracks;
  });
}
