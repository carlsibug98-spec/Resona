import type { AlbumCard, ArtistPage, Track } from "@/lib/types";
import { cacheGet, cacheSet, cached, fetchWithTimeout, mapPool } from "./cache.ts";

const YT_MUSIC = "https://music.youtube.com/youtubei/v1";

const CONTEXT = {
  client: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20240401.01.00",
    hl: "en",
    gl: "US",
  },
};

/* ── client rotation ────────────────────────────────────────────────────
 * music.youtube.com gates the WEB_REMIX client on some networks/regions
 * (429s or empty shelves). The same endpoints answer for the IOS and
 * ANDROID music clients, so a request that fails or parses empty is
 * retried once with each fallback context before giving up. */
const CLIENT_CONTEXTS: Record<string, unknown>[] = [
  CONTEXT,
  {
    client: {
      clientName: "IOS",
      clientVersion: "19.29.1",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "17.5.1.21F90",
      hl: "en",
      gl: "US",
    },
  },
  {
    client: {
      clientName: "ANDROID",
      clientVersion: "7.40.52",
      androidSdkVersion: 34,
      osName: "Android",
      osVersion: "14",
      hl: "en",
      gl: "US",
    },
  },
];

export async function innertubePost(
  endpoint: string,
  body: Record<string, unknown>,
  clientIndex = 0
): Promise<any> {
  const context = CLIENT_CONTEXTS[clientIndex] || CONTEXT;
  const res = await fetchWithTimeout(
    `${YT_MUSIC}/${endpoint}?prettyPrint=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, ...body }),
    },
    12000
  );
  if (!res.ok) throw new Error(`innertube ${endpoint} ${res.status}`);
  return res.json();
}

/** POST that rotates through the fallback clients. `isOk` lets callers
 *  treat a structurally-empty 200 (bot-gated shelf) as a failure worth
 *  retrying on the next client; the last error rethrows. */
async function innertubeRotating(
  endpoint: string,
  body: Record<string, unknown>,
  isOk: (data: any) => boolean
): Promise<any> {
  let lastErr: unknown = null;
  for (let i = 0; i < CLIENT_CONTEXTS.length; i++) {
    try {
      const data = await innertubePost(endpoint, body, i);
      if (isOk(data)) return data;
      lastErr = new Error(`innertube ${endpoint}: client #${i} answered but parsed empty`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`innertube ${endpoint} failed`);
}

 

function walk(o: any, key: string, depth = 0): any[] {
  if (depth > 14 || o == null) return [];
  let out: any[] = [];
  if (Array.isArray(o)) {
    for (const v of o) out = out.concat(walk(v, key, depth + 1));
  } else if (typeof o === "object") {
    for (const k of Object.keys(o)) {
      if (k === key) out.push(o[k]);
      out = out.concat(walk(o[k], key, depth + 1));
    }
  }
  return out;
}

export function parseDuration(text?: string): number | undefined {
  if (!text) return undefined;
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p))) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

function thumbFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function parseListItem(r: any): Track | null {
  try {
    const flex = r.flexColumns?.map(
      (c: any) => c.musicResponsiveListItemFlexColumnRenderer
    );
    const titleRuns = flex?.[0]?.text?.runs || [];
    const title = titleRuns.map((x: any) => x.text || "").join("").trim();
    if (!title) return null;

    let videoId: string | undefined =
      r.playlistItemData?.videoId ||
      r.overlay?.musicItemThumbnailOverlayRenderer?.content
        ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
      flex?.[0]?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
    if (!videoId) return null;

    let artist = "";
    let artistId: string | undefined;
    let album = "";
    let channelFallback = "";
    const others: string[] = [];
    // scan metadata columns: flex[1] for search rows, flex[1..3] for album pages
    for (const col of flex?.slice(1, 4) || []) {
      const metaRuns: any[] = col?.text?.runs || [];
      for (const run of metaRuns) {
        const nav = run.navigationEndpoint?.browseEndpoint;
        const pageType =
          nav?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
            ?.pageType || "";
        if (pageType === "MUSIC_PAGE_TYPE_ARTIST") {
          if (!artist) {
            artist = run.text;
            artistId = nav?.browseId;
          }
        } else if (pageType === "MUSIC_PAGE_TYPE_ALBUM") {
          album = album || run.text;
        } else if (run.text && run.text.trim() && run.text.trim() !== "•") {
          const txt = run.text.trim();
          // candidate channel/artist name: first non-view, non-duration run
          if (
            !channelFallback &&
            !/^\d+:\d\d(:\d\d)?$/.test(txt) &&
            !/view|plays|song|video/i.test(txt)
          ) {
            channelFallback = txt;
          }
          others.push(txt);
        }
      }
      // keep scanning later columns: official song rows carry "3.7B plays"
      // (views) in flex[2] even after the artist was found in flex[1]
    }
    if (!artist) {
      artist = channelFallback;
      // keep the nav-less channel id if present on the first run
      artistId =
        artistId ||
        flex?.[1]?.text?.runs?.find(
          (r: any) => r.navigationEndpoint?.browseEndpoint?.browseId
        )?.navigationEndpoint?.browseEndpoint?.browseId;
    }

    let dText = "";
    let views = "";
    for (const o of others) {
      if (/^\d+:\d\d(:\d\d)?$/.test(o)) dText = dText || o;
      else if (/view|plays/i.test(o)) views = o;
    }
    const fixed = r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer;
    const fixedText = fixed?.text?.simpleText || "";
    if (!dText && /^\d+:\d\d(:\d\d)?$/.test(fixedText)) dText = fixedText;

    return {
      videoId,
      title,
      artist: artist || "Unknown artist",
      artistId,
      album: album || undefined,
      duration: parseDuration(dText),
      durationText: dText || undefined,
      thumb: thumbFor(videoId),
      views: views || undefined,
    };
  } catch {
    return null;
  }
}

export async function searchTracksRaw(
  query: string,
  filter: "songs" | "videos" = "songs"
): Promise<Track[]> {
  const data = await innertubeRotating(
    "search",
    { query, filter },
    (d) => walk(d, "musicResponsiveListItemRenderer").length > 0
  );
  const items = walk(data, "musicResponsiveListItemRenderer");
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const item of items) {
    const t = parseListItem(item);
    if (t && !seen.has(t.videoId)) {
      seen.add(t.videoId);
      tracks.push(t);
    }
  }
  return tracks;
}

export async function searchTracks(
  query: string,
  filter: "songs" | "videos" = "songs"
): Promise<Track[]> {
  return cached(`search:${filter}:${query}`, 1000 * 60 * 30, () =>
    searchTracksRaw(query, filter)
  );
}

export interface ArtistHit {
  artistId: string;
  name: string;
  thumb?: string;
}

/** an album or community-playlist search hit. `browseId` is an MPRE…
 *  (album) or VL… (playlist) — navigates to the existing AlbumView. */
export interface CollectionHit {
  browseId: string;
  /** MPRE (album) or VL (community playlist) */
  kind: "album" | "playlist";
  title: string;
  subtitle: string;
  thumb?: string;
  /** the radio playlistId that plays this collection (OLAK5uy… or VL…) */
  radioId?: string;
}

/**
 * Album / community-playlist search. These rows navigate on the ITEM
 * itself (navigationEndpoint.browseEndpoint at the row level, not on a
 * text run): MPRE… = album, VL… = community playlist. The play overlay
 * carries a watchPlaylistEndpoint (the collection's radio), col1 runs
 * carry "Single/Album • artist • year" or "Playlist • creator • N songs".
 * v1.7.5: the filter needs the base64 `params` token — the plain
 * `filter:` name is silently ignored and returns songs.
 */
const SEARCH_PARAMS_TOKENS = {
  albums: "EgWKAQIYAWoKEAoQAxAEEAkQBQ==",
  community_playlists: "EgeKAQQoAEABagoQChADEAQQCRAF",
} as const;

export async function searchCollections(
  query: string,
  kind: "albums" | "community_playlists"
): Promise<CollectionHit[]> {
  return cached(`search:${kind}:${query}`, 1000 * 60 * 30, async () => {
    const data = await innertubePost("search", {
      query,
      params: SEARCH_PARAMS_TOKENS[kind],
    });
    const out: CollectionHit[] = [];
    const seen = new Set<string>();
    for (const item of walk(data, "musicResponsiveListItemRenderer")) {
      const nav = item?.navigationEndpoint?.browseEndpoint;
      const browseId: string | undefined = nav?.browseId;
      if (!browseId || !/^(MPRE|VL)/.test(browseId) || seen.has(browseId)) continue;

      const title: string =
        item?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
          ?.text || "";
      if (!title) continue;

      const subRuns =
        item?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const subtitle = subRuns.map((r: any) => r.text || "").join("").trim();

      const thumbSrc =
        item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      const radioId: string | undefined =
        item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchPlaylistEndpoint?.playlistId;

      seen.add(browseId);
      out.push({
        browseId,
        kind: browseId.startsWith("MPRE") ? "album" : "playlist",
        title,
        subtitle,
        thumb: thumbSrc.length ? thumbSrc[thumbSrc.length - 1].url : undefined,
        radioId,
      });
      if (out.length >= 12) break;
    }
    return out;
  });
}

/**
 * Artist results for a search query. The `artists` filter returns rows whose
 * artist page navigation is NOT on the title run (it's a watch link there) —
 * the artist browseId lives in the second column's artist-page run or in the
 * row menu's "Go to artist" item. The row thumbnail doubles as the artist
 * avatar, so no extra request is needed.
 */
export async function searchArtists(query: string): Promise<ArtistHit[]> {
  return cached(`search:artists:${query}`, 1000 * 60 * 30, async () => {
    const data = await innertubePost("search", { query, filter: "artists" });
    const out: ArtistHit[] = [];
    const seen = new Set<string>();
    for (const item of walk(data, "musicResponsiveListItemRenderer")) {
      const cols = (item?.flexColumns || []).map(
        (c: any) => c.musicResponsiveListItemFlexColumnRenderer
      );
      const title: string | undefined = cols?.[0]?.text?.runs?.[0]?.text;
      if (!title) continue;

      // candidate artist navigations: any run in cols[1..] pointing at an
      // artist page, else the menu's "Go to artist"
      let artistId: string | undefined;
      for (const col of cols.slice(1)) {
        for (const run of col?.text?.runs || []) {
          const nav = run.navigationEndpoint?.browseEndpoint;
          const pageType =
            nav?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
              ?.pageType;
          if (pageType === "MUSIC_PAGE_TYPE_ARTIST" && nav?.browseId?.startsWith("UC")) {
            artistId = nav.browseId;
          }
        }
      }
      if (!artistId) {
        for (const m of item?.menu?.menuRenderer?.items || []) {
          const nav = m.menuNavigationItemRenderer?.navigationEndpoint?.browseEndpoint;
          const pageType =
            nav?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
              ?.pageType;
          if (pageType === "MUSIC_PAGE_TYPE_ARTIST" && nav?.browseId?.startsWith("UC")) {
            artistId = nav.browseId;
          }
        }
      }
      if (!artistId || seen.has(artistId)) continue;
      seen.add(artistId);

      // name: prefer the artist-page run's text (the actual artist), fall
      // back to the row title (top result rows are named after the song)
      let name = title;
      for (const col of cols.slice(1)) {
        for (const run of col?.text?.runs || []) {
          const nav = run.navigationEndpoint?.browseEndpoint;
          if (
            nav?.browseId === artistId &&
            run.text?.trim() &&
            run.text.trim() !== "•"
          ) {
            name = run.text.trim();
          }
        }
      }

      const thumb: string | undefined =
        item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url;
      out.push({ artistId, name, thumb });
      if (out.length >= 6) break;
    }
    return out;
  });
}

/** Query completions for the search box dropdown, straight from YouTube
 *  Music's suggestion service. Short-lived cache — typing produces a
 *  burst of near-identical prefixes. */
export async function getSuggestions(input: string): Promise<string[]> {
  const q = input.trim();
  if (!q) return [];
  return cached(`suggest:${q.toLowerCase()}`, 1000 * 60 * 10, async () => {
    try {
      const data = await innertubePost("music/get_search_suggestions", { input: q });
      const out: string[] = [];
      for (const s of walk(data, "searchSuggestionRenderer")) {
        const text = s.suggestion?.runs?.map((r: any) => r.text || "").join("") || "";
        if (text && text.trim()) out.push(text.trim());
      }
      return out.slice(0, 8);
    } catch {
      return [];
    }
  });
}

/**
 * Resolve exact durations (seconds) for video ids. YT Music search and
 * playlist rows omit duration for official song results, so a fallback
 * is required. The innertube `player` endpoint is bot-gated, but the
 * `next` endpoint (radio queue for a seed video) returns 50 tracks with
 * lengthText — including the seed. Every harvested duration is cached
 * for a week, so one request usually covers dozens of ids.
 */
export async function getDurations(
  ids: string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const hit = cacheGet<number>(`dur:${id}`);
    if (hit != null && hit > 0) out[id] = hit;
    else missing.push(id);
  }
  if (!missing.length) return out;

  await mapPool(missing, 4, async (id) => {
    try {
      const data = await innertubePost("next", {
        videoId: id,
        playlistId: `RDAMVM${id}`,
      });
      for (const p of walk(data, "playlistPanelVideoRenderer")) {
        const vid: string | undefined = p.videoId;
        const text: string =
          p.lengthText?.simpleText ||
          p.lengthText?.runs?.map((r: any) => r.text || "").join("") ||
          "";
        const secs = parseDuration(text.trim());
        if (vid && secs && secs > 0) {
          cacheSet(`dur:${vid}`, secs, 1000 * 60 * 60 * 24 * 7);
        }
      }
      const mine = cacheGet<number>(`dur:${id}`);
      if (mine && mine > 0) out[id] = mine;
    } catch {
      /* leave id unresolved */
    }
  });
  return out;
}

export async function searchOne(
  query: string,
  filter: "songs" | "videos" = "songs"
): Promise<Track | null> {
  try {
    const tracks = await searchTracks(query, filter);
    return tracks[0] || null;
  } catch {
    return null;
  }
}

/**
 * Song radio: the YouTube Music mix ("RDAMVM…") for a seed video —
 * the queue that auto-continues from it. Deduped, seed excluded,
 * cached one hour.
 */
export async function radioFor(videoId: string): Promise<Track[]> {
  return cached(`radio:${videoId}`, 1000 * 60 * 60, async () => {
    const data = await innertubePost("next", {
      videoId,
      playlistId: `RDAMVM${videoId}`,
    });
    const panels = walk(data, "playlistPanelVideoRenderer");
    const tracks: Track[] = [];
    const seen = new Set<string>([videoId]);
    for (const p of panels) {
      const vid: string | undefined = p.videoId;
      if (!vid || seen.has(vid)) continue;
      const title: string =
        p.title?.runs?.map((r: any) => r.text || "").join("") ||
        p.title?.simpleText ||
        "";
      if (!title) continue;

      // byline runs: [artist] • [views] • [album/title…] — artist links to a channel
      const runs: any[] = [
        ...(p.shortBylineText?.runs || []),
        ...(p.longBylineText?.runs || []),
      ];
      let artist = "";
      let artistId: string | undefined;
      for (const run of runs) {
        const bid = run?.navigationEndpoint?.browseEndpoint?.browseId;
        if (bid && /^UC/.test(bid)) {
          artistId = artistId || bid;
          if (!artist) artist = String(run.text || "").trim();
        }
      }
      if (!artist) {
        for (const run of runs) {
          const t = String(run?.text || "").trim();
          if (t && t !== "•" && !/view|play|song/i.test(t)) {
            artist = t;
            break;
          }
        }
      }

      const len: string = (
        p.lengthText?.simpleText ||
        p.lengthText?.runs?.map((r: any) => r.text || "").join("") ||
        ""
      ).trim();

      seen.add(vid);
      tracks.push({
        videoId: vid,
        title,
        artist: artist || "Unknown artist",
        artistId,
        duration: parseDuration(len),
        durationText: len || undefined,
        thumb: thumbFor(vid),
      });
    }
    return tracks.slice(0, 40);
  });
}

function parseTwoRow(r: any): AlbumCard | null {
  try {
    const nav =
      r.navigationEndpoint?.watchEndpoint ||
      r.navigationEndpoint?.browseEndpoint;
    let playlistId = nav?.playlistId;
    const browseId = r.navigationEndpoint?.browseEndpoint?.browseId;
    if (!playlistId && browseId && browseId.startsWith("MPRE")) playlistId = browseId;
    if (!playlistId && nav?.videoId) playlistId = `RV${nav.videoId}`;
    if (!playlistId) return null;
    const title =
      r.title?.simpleText ||
      r.title?.runs?.[0]?.text ||
      r.title?.runs?.map((x: any) => x.text).join("") ||
      "";
    if (!title) return null;
    const thumbSrc =
      r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    const thumb = thumbSrc.length
      ? thumbSrc[thumbSrc.length - 1].url
      : "";
    const subtitle =
      r.subtitle?.runs?.map((x: any) => x.text).join("").trim() || "";
    return { playlistId, title, subtitle, thumb };
  } catch {
    return null;
  }
}

/** a musicTwoRowItemRenderer that navigates to a WATCH endpoint is a song
 *  (the "Videos" carousel on artist pages); one that browses a playlist is
 *  an album/single card. v1.7.4: artist "songs" shelves moved into this
 *  shape (musicShelfRenderer is gone), which emptied every artist page. */
function twoRowTrack(r: any): Track | null {
  try {
    const videoId = r.navigationEndpoint?.watchEndpoint?.videoId;
    if (!videoId) return null;
    const title =
      r.title?.runs?.[0]?.text ||
      r.title?.simpleText ||
      "";
    if (!title) return null;
    const thumbSrc =
      r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    const thumb = thumbSrc.length
      ? thumbSrc[thumbSrc.length - 1].url
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const subRuns = r.subtitle?.runs?.map((x: any) => x.text).join("").trim() || "";
    // "OxYy • 467 views" — artist is everything before the first separator
    const artist = subRuns.split(/[·•]/)[0].trim();
    return {
      videoId,
      title,
      artist: artist || subRuns,
      artistId: r.navigationEndpoint?.watchEndpoint?.browseId,
      thumb,
      views: subRuns.split(/[·•]/).slice(1).join("·").trim() || undefined,
    };
  } catch {
    return null;
  }
}

export async function browseArtist(browseId: string): Promise<ArtistPage> {
  return cached(`artist:${browseId}`, 1000 * 60 * 60, async () => {
    const data = await innertubePost("browse", { browseId });

    let name = "";
    const headers = [
      ...walk(data, "musicImmersiveHeaderRenderer"),
      ...walk(data, "musicDetailHeaderRenderer"),
      ...walk(data, "musicResponsiveHeaderRenderer"),
      // v1.7.4: artist browse now answers with musicVisualHeaderRenderer
      // (the old three vanished) — without it every artist name was ""
      ...walk(data, "musicVisualHeaderRenderer"),
    ];
    let headerThumb: string | undefined;
    if (headers.length) {
      const h = headers[0];
      name =
        h.title?.simpleText ||
        h.title?.runs?.[0]?.text ||
        "";
      const thumbSrc =
        h.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
        h.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ||
        h.thumbnail?.thumbnails ||
        [];
      headerThumb = thumbSrc.length
        ? thumbSrc[thumbSrc.length - 1].url
        : undefined;
    }

    const songs: Track[] = [];
    const albums: AlbumCard[] = [];
    const singles: AlbumCard[] = [];
    const seenSong = new Set<string>();
    const seenAlbum = new Set<string>();

    const shelves = [
      ...walk(data, "musicShelfRenderer"),
      ...walk(data, "musicPlaylistShelfRenderer"),
    ];
    for (const shelf of shelves) {
      const items = shelf.contents || [];
      for (const item of items) {
        const t = parseListItem(item.musicResponsiveListItemRenderer || item);
        if (t && !seenSong.has(t.videoId)) {
          seenSong.add(t.videoId);
          songs.push(t);
        }
      }
    }

    const carousels = walk(data, "musicCarouselShelfRenderer");
    for (const c of carousels) {
      const ctitle = c.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text || "";
      const rows = [
        ...walk(c, "musicTwoRowItemRenderer"),
      ];
      for (const r of rows) {
        // v1.7.4: "Videos"/"Songs" carousel items are watchable tracks —
        // the only place artist songs live now. Skipping them (the old
        // code only mined albums here) left every artist page songless,
        // which disabled the Play button: "click does nothing".
        const t = twoRowTrack(r);
        if (t && !seenSong.has(t.videoId)) {
          seenSong.add(t.videoId);
          songs.push(t);
          continue;
        }
        const card = parseTwoRow(r);
        if (!card) continue;
        if (seenAlbum.has(card.playlistId + card.title)) continue;
        seenAlbum.add(card.playlistId + card.title);
        const isSingle = /single|ep/i.test(ctitle);
        const isVideo = /video/i.test(ctitle);
        if (isVideo) continue;
        if (isSingle) singles.push(card);
        else albums.push(card);
      }
    }

    return {
      name,
      thumb: headerThumb,
      songs,
      albums: albums.slice(0, 12),
      singles: singles.slice(0, 12),
    };
  });
}

export async function browsePlaylist(
  playlistId: string
): Promise<{ name: string; tracks: Track[] }> {
  return cached(`playlist:${playlistId}`, 1000 * 60 * 60, async () => {
    const id = /^MPRE/.test(playlistId)
      ? playlistId
      : playlistId.startsWith("VL")
        ? playlistId
        : `VL${playlistId}`;
    const data = await innertubePost("browse", { browseId: id });

    let name = "";
    const headers = [
      ...walk(data, "musicDetailHeaderRenderer"),
      ...walk(data, "musicResponsiveHeaderRenderer"),
      ...walk(data, "musicImmersiveHeaderRenderer"),
    ];
    if (headers.length) {
      const h = headers[0];
      name = h.title?.simpleText || h.title?.runs?.[0]?.text || "";
    }

    const tracks: Track[] = [];
    const seen = new Set<string>();
    const shelves = [
      ...walk(data, "musicShelfRenderer"),
      ...walk(data, "musicPlaylistShelfRenderer"),
    ];
    // album pages carry the artist in the header, not in the rows
    let headerArtist = "";
    if (headers.length) {
      for (const run of headers[0].subtitle?.runs || []) {
        const pt =
          run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
            ?.browseEndpointContextMusicConfig?.pageType || "";
        if (pt === "MUSIC_PAGE_TYPE_ARTIST") {
          headerArtist = run.text;
          break;
        }
      }
    }
    if (!headerArtist) {
      // fallback: first run anywhere on the page that links to an artist page
      for (const grp of walk(data, "runs")) {
        for (const run of grp) {
          const pt =
            run.navigationEndpoint?.browseEndpoint
              ?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
              ?.pageType || "";
          if (pt === "MUSIC_PAGE_TYPE_ARTIST" && run.text) {
            headerArtist = run.text;
            break;
          }
        }
        if (headerArtist) break;
      }
    }
    for (const shelf of shelves) {
      for (const item of shelf.contents || []) {
        const t = parseListItem(item.musicResponsiveListItemRenderer || item);
        if (t && !seen.has(t.videoId)) {
          seen.add(t.videoId);
          if (t.artist === "Unknown artist" && headerArtist) {
            t.artist = headerArtist;
          }
          tracks.push(t);
        }
      }
    }
    return { name, tracks };
  });
}

export async function resolveMany(
  queries: { key: string; query: string; filter?: "songs" | "videos" }[],
  concurrency = 5
): Promise<Map<string, Track | null>> {
  const out = new Map<string, Track | null>();
  await mapPool(queries, concurrency, async (q) => {
    out.set(q.key, await searchOne(q.query, q.filter || "songs"));
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * YouTube Charts fallback (keyless, real data) — used when kworb is
 * unreachable or resolves nothing, so the home shelves and the
 * trending view can never go empty. browse FEmusic_charts lists the
 * per-country chart pages ("Trending 20 …", "Top 100 Music Videos …");
 * each page is a playlist browse full of playable videos.
 * ------------------------------------------------------------------ */

export interface ChartPage {
  title: string;
  browseId: string;
}

/** Pure: pick the best chart page for a worldwide feed — prefer the big
 * "Top 100 Music Videos" / "Daily Top" pages, else the first listed. */
export function pickChartPage(pages: ChartPage[]): ChartPage | null {
  if (!pages.length) return null;
  return (
    pages.find((p) => /top\s*100/i.test(p.title)) ||
    pages.find((p) => /daily\s*top/i.test(p.title)) ||
    pages.find((p) => /trending/i.test(p.title)) ||
    pages[0]
  );
}

/** Pure: turn a chart-page browse response into playable tracks.
 * Rows are musicResponsiveListItemRenderer (same shape as search rows). */
export function parseChartPage(data: unknown, limit = 40): Track[] {
  const rows = walk(data as Record<string, unknown>, "musicResponsiveListItemRenderer");
  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    let t: Track | null = null;
    try {
      t = parseListItem(r);
    } catch {
      t = null;
    }
    if (t && t.videoId && !seen.has(t.videoId)) {
      seen.add(t.videoId);
      tracks.push(t);
      if (tracks.length >= limit) break;
    }
  }
  return tracks;
}

/** Chart pages currently listed on FEmusic_charts (cached 3h). */
export async function listChartPages(): Promise<ChartPage[]> {
  return cached("charts:pages", 1000 * 60 * 60 * 3, async () => {
    const data = await innertubePost("browse", { browseId: "FEmusic_charts" });
    const items = walk(data, "musicTwoRowItemRenderer");
    const pages: ChartPage[] = [];
    for (const it of items) {
      const ep = it.navigationEndpoint?.browseEndpoint;
      const title = it.title?.runs?.map((r: { text?: string }) => r.text || "").join("") || "";
      if (ep?.browseId && String(ep.browseId).startsWith("VL") && title) {
        pages.push({ title, browseId: String(ep.browseId) });
      }
    }
    if (!pages.length) throw new Error("charts: no chart pages listed");
    return pages;
  });
}

/** Trending tracks straight from YouTube Charts — the never-empty
 * fallback for the kworb path. Throws when charts are unreachable too,
 * so callers can show a genuine error instead of an empty shelf. */
export async function getChartsTrending(limit = 40): Promise<Track[]> {
  const pages = await listChartPages();
  const page = pickChartPage(pages);
  if (!page) throw new Error("charts: no page picked");
  const data = await innertubePost("browse", { browseId: page.browseId });
  const tracks = parseChartPage(data, limit);
  if (!tracks.length) throw new Error("charts: page resolved to no tracks");
  return tracks;
}
