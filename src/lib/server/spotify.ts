import type { SpotifyImportResult, Track } from "@/lib/types";
import { cached, fetchWithTimeout, mapPool } from "./cache";
import { searchOne } from "./innertube";

 

export function extractPlaylistId(input: string): string | null {
  const m =
    input.match(/playlist\/([A-Za-z0-9]+)/) ||
    input.match(/^([A-Za-z0-9]{22})$/);
  return m ? m[1] : null;
}

interface EmbedTrack {
  title: string;
  subtitle: string;
  durationMs: number;
}

function findTrackList(obj: any, depth = 0): EmbedTrack[] | null {
  if (depth > 16 || obj == null) return null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = findTrackList(v, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === "object") {
    if (Array.isArray(obj.trackList) && obj.trackList.length) {
      return obj.trackList
        .map((t: any) => ({
          title: String(t.title || ""),
          subtitle: String(t.subtitle || ""),
          durationMs: Number(t.duration || 0),
        }))
        .filter((t: EmbedTrack) => t.title);
    }
    for (const k of Object.keys(obj)) {
      const r = findTrackList(obj[k], depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function findEntityMeta(obj: any, depth = 0): { name?: string; cover?: string } | null {
  if (depth > 16 || obj == null) return null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = findEntityMeta(v, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === "object") {
    if (obj.entity && typeof obj.entity === "object" && obj.entity.title) {
      const cover = obj.entity.coverArt?.sources;
      return {
        name: obj.entity.title,
        cover: cover && cover.length ? cover[cover.length - 1].url : undefined,
      };
    }
    for (const k of Object.keys(obj)) {
      const r = findEntityMeta(obj[k], depth + 1);
      if (r) return r;
    }
  }
  return null;
}

export async function fetchSpotifyEmbed(
  playlistId: string
): Promise<{ name: string; cover?: string; tracks: EmbedTrack[] }> {
  return cached(`spotify:embed:${playlistId}`, 1000 * 60 * 60 * 6, async () => {
    const res = await fetchWithTimeout(
      `https://open.spotify.com/embed/playlist/${playlistId}`,
      {
        headers: {
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      15000
    );
    if (!res.ok) throw new Error(`spotify embed ${res.status}`);
    const html = await res.text();
    const m = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!m) throw new Error("spotify: no __NEXT_DATA__ found");
    const data = JSON.parse(m[1]);
    const tracks = findTrackList(data);
    if (!tracks || !tracks.length)
      throw new Error("spotify: playlist empty or not public");
    const meta = findEntityMeta(data) || {};
    return { name: meta.name || "Imported playlist", cover: meta.cover, tracks };
  });
}

function cleanTitle(t: string): string {
  return t
    .replace(/\((feat|ft)\.?[^)]*\)/gi, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/-\s*(remaster(ed)?|radio edit|single version|album version)$/i, "")
    .trim();
}

export async function importSpotifyPlaylist(
  input: string,
  onProgress?: (done: number, total: number) => void
): Promise<SpotifyImportResult> {
  const playlistId = extractPlaylistId(input);
  if (!playlistId) throw new Error("Invalid Spotify playlist URL");
  const embed = await fetchSpotifyEmbed(playlistId);

  const tracks: Track[] = [];
  const unmatched: { title: string; artist: string }[] = [];
  let done = 0;

  const results = await mapPool(embed.tracks, 4, async (t) => {
    const query = `${cleanTitle(t.title)} ${t.subtitle.split(/[,;&]/)[0].trim()}`.trim();
    let matched = await searchOne(query, "songs");
    if (!matched) matched = await searchOne(cleanTitle(t.title), "songs");
    done++;
    onProgress?.(done, embed.tracks.length);
    return { source: t, matched };
  });

  for (const { source, matched } of results) {
    if (matched) tracks.push(matched);
    else unmatched.push({ title: source.title, artist: source.subtitle });
  }

  return {
    id: playlistId,
    name: embed.name,
    cover: embed.cover,
    total: embed.tracks.length,
    tracks,
    unmatched,
  };
}
