"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { CoverArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { markStep } from "@/lib/onboarding";

interface ArtistHit {
  artistId: string;
  name: string;
  thumb?: string;
}

/** an album / community-playlist hit from /api/search?collections=1 */
interface CollectionHit {
  browseId: string;
  kind: "album" | "playlist";
  title: string;
  subtitle: string;
  thumb?: string;
  radioId?: string;
}

/** Spotify's search filter tabs (music types only — YouTube Music has no
 *  podcasts/audiobooks, so those chips from the reference video map to
 *  the four tabs that exist here) */
type SearchTab = "all" | "songs" | "playlists" | "albums" | "artists";
const TABS: { id: SearchTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "songs", label: "Songs" },
  { id: "playlists", label: "Playlists" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
];

/**
 * Search results page — the Spotify pattern from the reference video:
 * NO in-page search bar (the top-bar search drives everything; this page
 * renders whatever `q` it was navigated with), a filter-chip row, a
 * Top-result hero card, and per-type shelves/tabs.
 */
export function SearchView({ initialQuery }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [tab, setTab] = useState<SearchTab>("all");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [artists, setArtists] = useState<ArtistHit[]>([]);
  const [albums, setAlbums] = useState<CollectionHit[]>([]);
  const [playlists, setPlaylists] = useState<CollectionHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [failed, setFailed] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  const player = usePlayer();
  const library = useLibrary();
  const navigate = useUi((s) => s.navigate);

  useEffect(() => {
    return () => {
      ctrlRef.current?.abort();
    };
  }, []);

  /* ---------------------------- full search (debounced) -------------------- */

  const runSearch = useCallback(async (query: string) => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    setFailed(false);
    try {
      // collections=1: this page wants albums + community playlists for
      // its filter tabs (the dropdown omits them to stay fast)
      const r = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&collections=1`,
        { signal: ctrl.signal }
      );
      if (r.ok) {
        const d = await r.json();
        if (ctrl.signal.aborted) return;
        setTracks(Array.isArray(d.tracks) ? d.tracks : []);
        setArtists(Array.isArray(d.artists) ? d.artists : []);
        setAlbums(Array.isArray(d.albums) ? d.albums : []);
        setPlaylists(Array.isArray(d.playlists) ? d.playlists : []);
        setSearched(true);
        return;
      }
      throw new Error(`search ${r.status}`);
    } catch {
      if (!ctrl.signal.aborted) {
        setTracks([]);
        setArtists([]);
        setAlbums([]);
        setPlaylists([]);
        setSearched(true);
        setFailed(true);
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const query = q.trim();
    // the first real search finishes the first getting-started step
    if (query.length >= 2) markStep("search");
    if (query.length < 2) {
      ctrlRef.current?.abort();
      setTracks([]);
      setArtists([]);
      setAlbums([]);
      setPlaylists([]);
      setSearched(false);
      setLoading(false);
      setFailed(false);
      return;
    }
    const t = setTimeout(() => void runSearch(query), 350);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  /** library songs that match the query — shown above live results */
  const localHits = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const pool: Track[] = [];
    for (const l of Object.values(library.liked)) pool.push(l.track);
    for (const p of library.playlists) pool.push(...p.tracks);
    for (const h of library.history) pool.push(h.track);
    const seen = new Set<string>();
    return pool.filter((t) => {
      if (seen.has(t.videoId)) return false;
      seen.add(t.videoId);
      return `${t.title} ${t.artist}`.toLowerCase().includes(query);
    });
  }, [q, library.liked, library.playlists, library.history]);

  const hasQuery = q.trim().length >= 2;
  const nothing =
    searched &&
    !loading &&
    !tracks.length &&
    !artists.length &&
    !albums.length &&
    !playlists.length &&
    !localHits.length;

  const playCollection = (c: CollectionHit) => {
    // a collection's radio queue plays instantly from the seed id; the
    // album view itself needs its own fetch first
    navigate({
      name: "album",
      id: c.browseId,
      label: c.title,
      subtitle: c.subtitle,
    });
  };

  const openArtist = (a: ArtistHit) =>
    navigate({ name: "artist", id: a.artistId, label: a.name });

  /* ------------------------------ cards ---------------------------------- */

  const artistCard = (a: ArtistHit, i: number) => (
    <div className="card-item" key={`ar-${a.artistId}`}>
      <button className="face" onClick={() => openArtist(a)}>
        <span className="cov round">
          {a.thumb ? (
            <img src={a.thumb} alt={a.name} loading="lazy" />
          ) : (
            <span>{a.name.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className="t trunc">{a.name}</span>
        <span className="s">Artist</span>
      </button>
    </div>
  );

  const collectionCard = (c: CollectionHit) => (
    <div className="card-item" key={`cl-${c.browseId}`}>
      <button
        className="face"
        onClick={() => playCollection(c)}
        aria-label={`${c.kind === "album" ? "Album" : "Playlist"}: ${c.title}`}
      >
        <span className={`cov${c.kind === "album" ? "" : " round"}`}>
          {c.thumb ? (
            <img src={c.thumb} alt="" loading="lazy" />
          ) : (
            <span>{c.title.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className="t trunc">{c.title}</span>
        <span className="s trunc">{c.subtitle}</span>
      </button>
    </div>
  );

  const songList = (list: Track[], label: string, all?: boolean) => (
    <div className="tlist">
      <TrackTableHead />
      {(all ? list : list.slice(0, 4)).map((t, i) => (
        <TrackRow
          key={t.videoId}
          track={t}
          index={i}
          list={list}
          contextLabel={label}
        />
      ))}
    </div>
  );

  /* ------------------------------ skeletons ------------------------------ */

  const shelfSkeleton = (
    <div className="shelf" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card-item">
          <div className="face">
            <span className="cov">
              <span className="sk sq" />
            </span>
            <span className="sk line" style={{ marginTop: 10 }} />
            <span className="sk line short" />
          </div>
        </div>
      ))}
    </div>
  );

  const rowSkeleton = (
    <div className="tlist" aria-label="Searching">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="sk-row">
          <div className="sk sq" />
          <div className="lines">
            <div className="sk line" />
            <div className="sk line short" />
          </div>
          <span />
        </div>
      ))}
    </div>
  );

  /* ------------------------------ render --------------------------------- */

  // idle (no query): keep the genre browse tiles
  if (!hasQuery) {
    return (
      <>
        <div className="hero tight">
          <h1>Search</h1>
        </div>
        <h2 className="browse-h">Browse all</h2>
        <div className="genres">
          {GENRES.map(([g, color]) => (
            <button key={g} className="genre" onClick={() => setQ(g)} style={{ background: color }}>
              {g}
            </button>
          ))}
        </div>
      </>
    );
  }

  const top = localHits[0] ?? tracks[0];
  const topIsLocal = localHits.length > 0;

  return (
    <div className="sr-page">
      {/* filter chips — Spotify's tab row (All/Songs/Playlists/Albums/Artists) */}
      <div className="sr-tabs" role="tablist" aria-label="Search filter">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`sr-chip${tab === t.id ? " on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <>
          {tab === "all" || tab === "songs" ? rowSkeleton : null}
          {(tab === "all" || tab === "playlists" || tab === "albums" || tab === "artists") &&
            shelfSkeleton}
        </>
      ) : failed ? (
        <div className="empty">
          <Icon name="search" />
          <h3>Search is unreachable right now</h3>
          <p>The music source didn&apos;t answer. Check your connection and try again.</p>
          <button className="btn2 ghost" onClick={() => void runSearch(q.trim())}>
            Try again
          </button>
        </div>
      ) : nothing ? (
        <div className="empty">
          <Icon name="search" />
          <h3>No results for “{q.trim()}”</h3>
          <p>Check the spelling or try an artist name.</p>
        </div>
      ) : tab === "all" ? (
        <>
          <div className="sr-grid">
            {/* top result hero — Spotify's big card */}
            {top && (
              <section className="sr-topres" aria-label="Top result">
                <h2 className="kicker-s muted">Top result</h2>
                <button
                  className="topres"
                  onClick={() => {
                    const ctx = [...localHits, ...tracks];
                    player.playQueue(ctx, 0, `Search: ${q.trim()}`);
                  }}
                >
                  <CoverArt track={top} className="cov" />
                  <div className="grow">
                    <div className="big trunc">{top.title}</div>
                    <div className="muted">
                      Song · {top.artist}
                      {topIsLocal ? " · in your library" : ""}
                    </div>
                  </div>
                  <span className="fab sm">
                    <Icon name="play" fill />
                  </span>
                </button>
              </section>
            )}

            {/* songs list beside the hero (Spotify: top result + 4 songs) */}
            {tracks.length > 0 && (
              <section className="sr-songs" aria-label="Songs">
                <h2 className="kicker-s muted">Songs</h2>
                {songList(tracks, `Search: ${q.trim()}`)}
              </section>
            )}
          </div>

          {localHits.length > 0 && (
            <>
              <div className="section-h s20">
                <h2>From your library</h2>
              </div>
              <div className="tlist">
                {localHits.map((t, i) => (
                  <TrackRow
                    key={t.videoId}
                    track={t}
                    index={i}
                    list={localHits}
                    contextLabel="Your library"
                  />
                ))}
              </div>
            </>
          )}

          {artists.length > 0 && (
            <section className="sr-shelf">
              <div className="section-h s20">
                <h2>Artists</h2>
              </div>
              <div className="shelf hscroll">{artists.map(artistCard)}</div>
            </section>
          )}

          {albums.length > 0 && (
            <section className="sr-shelf">
              <div className="section-h s20">
                <h2>Albums</h2>
              </div>
              <div className="shelf hscroll">{albums.map(collectionCard)}</div>
            </section>
          )}

          {playlists.length > 0 && (
            <section className="sr-shelf">
              <div className="section-h s20">
                <h2>Playlists</h2>
              </div>
              <div className="shelf hscroll">{playlists.map(collectionCard)}</div>
            </section>
          )}
        </>
      ) : tab === "songs" ? (
        <>
          <div className="section-h s20">
            <h2>Songs</h2>
          </div>
          {tracks.length
            ? songList(tracks, `Search: ${q.trim()}`, true)
            : rowSkeleton}
          {localHits.length > 0 && (
            <>
              <div className="section-h s20">
                <h2>From your library</h2>
              </div>
              <div className="tlist">
                {localHits.map((t, i) => (
                  <TrackRow
                    key={t.videoId}
                    track={t}
                    index={i}
                    list={localHits}
                    contextLabel="Your library"
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : tab === "artists" ? (
        <>
          <div className="section-h s20">
            <h2>Artists</h2>
          </div>
          <div className="shelf">{artists.length ? artists.map(artistCard) : null}</div>
        </>
      ) : (
        <section className="sr-shelf">
          <div className="section-h s20">
            <h2>{tab === "albums" ? "Albums" : "Playlists"}</h2>
          </div>
          <div className="shelf">
            {(tab === "albums" ? albums : playlists).map(collectionCard)}
          </div>
        </section>
      )}
    </div>
  );
}

/* mockup browse tiles: genre → colour */
const GENRES: [string, string][] = [
  ["OPM", "#7c5cff"],
  ["Pinoy Pop", "#e11d74"],
  ["Acoustic", "#0f766e"],
  ["Chill", "#1d4ed8"],
  ["Throwback", "#b45309"],
  ["Hip-hop", "#be123c"],
  ["Lo-fi", "#4d7c0f"],
  ["Podcasts", "#334155"],
];
