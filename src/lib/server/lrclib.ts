import type { LyricLine, Lyrics } from "@/lib/types";
import { cached, fetchWithTimeout } from "./cache";

function parseSynced(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const LINE = /^\s*\[(\d+):(\d+)(?:[.:](\d+))?\]\s*(.*)$/;
  const WORD = /<(\d+):(\d+)(?:[.:](\d+))?>/g;
  for (const rawLine of raw.split("\n")) {
    const m = rawLine.match(LINE);
    const words = [...rawLine.matchAll(WORD)];
    if (!m && !words.length) continue;
    let t: number;
    let text: string;
    if (m) {
      t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].padEnd(3, "0").slice(0, 3), 10) / 1000 : 0);
      text = m[4];
    } else {
      // A2 line without a line-level tag: use the first word timestamp
      const w = words[0];
      t = parseInt(w[1], 10) * 60 + parseInt(w[2], 10) + (w[3] ? parseInt(w[3].padEnd(3, "0").slice(0, 3), 10) / 1000 : 0);
      text = rawLine;
    }
    // strip embedded word-level timestamps (A2 enhanced format)
    text = text
      .replace(/<\d+:\d+(?:[.:]\d+)?>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    lines.push({ t, text });
  }
  lines.sort((a, b) => a.t - b.t);
  return lines;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((?:feat|ft)\.?[^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, " ")
    .trim();
}

async function tryGet(
  params: URLSearchParams
): Promise<{ syncedLyrics: string | null; plainLyrics: string | null } | null> {
  const res = await fetchWithTimeout(
    `https://lrclib.net/api/get?${params.toString()}`,
    { headers: { "Lrclib-Client": "Resona/1.0 (github)" } },
    10000
  );
  if (!res.ok) return null;
  return res.json();
}

function cleanTitle(t: string, artist: string): string[] {
  const variants = new Set<string>();
  const add = (s: string) => {
    const v = s
      .trim()
      .replace(/\s{2,}/g, " ")
      .replace(/^[•·|,\-–—\s]+|[•·|,\-–—\s]+$/g, "")
      .trim();
    if (v && v.length >= 2) variants.add(v);
  };
  const stripDecor = (s: string) =>
    s
      .replace(/\((?:live|remaster(?:ed)?|remix|acoustic|cover|radio edit|single version|album version|version|from|feat\.?|ft\.?|with|official|hq|hd|4k)[^)]*\)/gi, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\|[^|]*$/g, "")
      .replace(/【[^】]*】/g, "");

  const stripArtistPrefix = (s: string) => {
    let out = s;
    const a = artist.trim();
    if (a && out.toLowerCase().startsWith(a.toLowerCase())) {
      out = out.slice(a.length);
    }
    // "<anyone> performing|singing|covers <title>" → "<title>"
    out = out.replace(/^.{1,60}?\s(performing|sings?|singing|covers?|cover of)\s+/i, "");
    // leading "performing ..." with no subject
    out = out.replace(/^(performing|sings?|singing|covers?)\s+/i, "");
    return out;
  };

  add(t);
  add(stripDecor(t));
  add(t.replace(/\s[-–—]\s(?:live|remix|remaster|acoustic|from|at)[^-]*$/i, ""));
  add(t.split(/\s[-–—]\s/)[0]);
  const pipeCut = t.split(/\||｜/)[0];
  add(pipeCut);
  const dashCut = t.split(/\s[-–—]\s/)[0];
  add(stripArtistPrefix(stripDecor(dashCut)));
  add(stripArtistPrefix(stripDecor(pipeCut)));
  add(stripArtistPrefix(stripDecor(t)));
  // aggressive: artist-performing pattern applied to the full title too
  add(stripDecor(pipeCut).replace(/^.{1,60}?\s(performing|sings?|singing|covers?)\s+/i, ""));
  return [...variants];
}

export async function getLyrics(
  title: string,
  artist: string,
  durationSec?: number
): Promise<Lyrics> {
  const cacheKey = `lyrics:v3:${title}|${artist}|${durationSec || 0}`;
  return cached(cacheKey, 1000 * 60 * 60 * 24, async () => {
    const titles = cleanTitle(title, artist);
    const artistFirst = artist.split(/[,;&]/)[0].trim();

    const attempts: URLSearchParams[] = [];
    for (const t of titles) {
      const base = new URLSearchParams({ track_name: t, artist_name: artist });
      if (durationSec) base.set("duration", String(Math.round(durationSec)));
      attempts.push(base);
      attempts.push(new URLSearchParams({ track_name: t, artist_name: artist }));
      if (artistFirst && artistFirst !== artist) {
        attempts.push(new URLSearchParams({ track_name: t, artist_name: artistFirst }));
      }
    }

    for (const params of attempts) {
      if (!params.get("track_name")) continue;
      try {
        const hit = await tryGet(params);
        if (hit && (hit.syncedLyrics || hit.plainLyrics)) {
          return {
            synced: hit.syncedLyrics ? parseSynced(hit.syncedLyrics) : null,
            plain: hit.plainLyrics,
            source: "LRCLIB",
          };
        }
      } catch {
        /* try next */
      }
    }

    // search endpoint fallback over cleaned titles and artist variants
    const artistVariants = [artistFirst, artist, ""].filter(
      (a, i, arr) => a !== artistFirst || i === 0
    );
    const seenArtist = new Set<string>();
    for (const t of titles) {
      for (const av of [...artistVariants, ""]) {
        const key = `${t}::${av}`;
        if (seenArtist.has(key)) continue;
        seenArtist.add(key);
        try {
          const q = new URLSearchParams({ track_name: t });
          if (av) q.set("artist_name", av);
          const res = await fetchWithTimeout(
            `https://lrclib.net/api/search?${q.toString()}`,
            { headers: { "Lrclib-Client": "Resona/1.0 (github)" } },
            10000
          );
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length) {
            let best = list[0];
            if (durationSec) {
              let bestDiff = Infinity;
              for (const item of list) {
                const diff = Math.abs((item.duration || 0) - durationSec);
                if (diff < bestDiff) {
                  bestDiff = diff;
                  best = item;
                }
              }
            }
            return {
              synced: best.syncedLyrics ? parseSynced(best.syncedLyrics) : null,
              plain: best.plainLyrics,
              source: "LRCLIB",
            };
          }
        }
        } catch {
          /* next */
        }
      }
    }

    return { synced: null, plain: null, source: "none" };
  });
}
