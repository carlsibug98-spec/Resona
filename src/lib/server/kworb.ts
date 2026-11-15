import type { Track } from "@/lib/types";
import { cached, fetchWithTimeout, mapPool } from "./cache";
import { searchOne } from "./innertube";

 

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

async function getTrendingRows(): Promise<KworbRow[]> {
  return cached("kworb:trending", 1000 * 60 * 60 * 3, async () => {
    const html = await fetchKworb(TRENDING_URL);
    return parseKworbRows(html);
  });
}

export async function getRegions(): Promise<string[]> {
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
}

export async function getTrending(region = "Global", limit = 40): Promise<Track[]> {
  // The expensive part is resolving every kworb row to a real video via innertube
  // (40+ upstream searches). Cache the RESOLVED tracks, not just the raw rows,
  // so a warm home visit costs zero upstream requests.
  return cached(
    `kworb:trending-resolved:${region}:${limit}`,
    1000 * 60 * 60 * 6,
    async () => {
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

      const queries = selected.map((r) => ({
        key: String(r.rank),
        query: cleanQuery(r.title),
        filter: "videos" as const,
      }));

      const resolved = new Map<string, Track | null>();
      await mapPool(queries, 4, async (q) => {
        let t = await searchOne(q.query, "videos");
        if (!t) t = await searchOne(q.query, "songs");
        resolved.set(q.key, t);
      });

      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const r of selected) {
        const t = resolved.get(String(r.rank));
        if (t && !seen.has(t.videoId)) {
          seen.add(t.videoId);
          tracks.push(t);
        }
      }
      return tracks;
    }
  );
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
    return tracks;
  });
}
