"use client";

import { useEffect, useState } from "react";
import type { Track } from "@/lib/types";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackRow } from "@/components/track/TrackRow";
import { Heart, ListPlus, Play, Search } from "lucide-react";
import { monoGradient } from "@/lib/format";
import { cn } from "@/lib/utils";

type Chip = "all" | "music" | "playlists";

/* Spotify-green hover play button — slides up like the real thing */
const FAB =
  "absolute z-10 flex h-12 w-12 translate-y-2 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5eead4,#7c5cff)] text-black opacity-0 shadow-[0_8px_16px_rgba(0,0,0,.4)] transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-active:scale-90 focus-visible:translate-y-0 focus-visible:opacity-100";

const FAB_ICON = <Play className="h-5 w-5 translate-x-[1px] fill-current" />;

const LIKED_COVER = (
  <span className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#450af5,#c4efd9)] text-white">
    <Heart className="h-7 w-7 fill-current" />
  </span>
);

interface Item {
  key: string;
  name: string;
  sub: string;
  cover: React.ReactNode;
  onOpen: () => void;
  onPlay: () => void;
}

/* ── quick tile: 76px art on the left, bold label, green fab on hover ── */
function Tile({ item }: { item: Item }) {
  return (
    <div className="group relative flex h-16 items-center overflow-hidden rounded-md bg-foreground/10 transition-colors duration-200 hover:bg-foreground/[.15] sm:h-[76px]">
      <button
        className="flex h-full min-w-0 flex-1 items-center text-left"
        onClick={item.onOpen}
        aria-label={item.name}
      >
        <span className="relative h-full w-16 shrink-0 sm:w-[76px]">{item.cover}</span>
        <span className="min-w-0 flex-1 truncate px-3 text-[15px] font-bold">{item.name}</span>
      </button>
      <button className={cn(FAB, "bottom-[10px] right-2.5 h-11 w-11")} onClick={item.onPlay} aria-label={`Play ${item.name}`}>
        {FAB_ICON}
      </button>
    </div>
  );
}

/* ── shelf card: square cover, bold title, grey sub, green fab on hover ── */
function Card({ item }: { item: Item }) {
  return (
    <div className="group relative min-w-0 rounded-md p-2.5 transition-colors duration-200 hover:bg-foreground/[.08]">
      <button className="block w-full text-left" onClick={item.onOpen} aria-label={item.name}>
        <span className="relative block aspect-square overflow-hidden rounded-md bg-muted shadow-[0_8px_24px_rgba(0,0,0,.5)]">
          {item.cover}
        </span>
        <span className="mt-2 block truncate text-[15px] font-bold">{item.name}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{item.sub}</span>
      </button>
      <button className={cn(FAB, "bottom-14 right-4")} onClick={item.onPlay} aria-label={`Play ${item.name}`}>
        {FAB_ICON}
      </button>
    </div>
  );
}

/* ── shelf: 22px bold header, hover-revealed "Show all" ── */
function Shelf({
  title,
  onShowAll,
  children,
}: {
  title: string;
  onShowAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="group/shelf mt-8">
      <div className="flex items-end justify-between">
        <button
          className="text-[22px] font-bold tracking-tight hover:underline"
          onClick={onShowAll}
          tabIndex={onShowAll ? 0 : -1}
        >
          {title}
        </button>
        {onShowAll && (
          <button
            className="mb-1 text-[13px] font-bold text-muted-foreground opacity-0 transition-opacity hover:underline focus-visible:opacity-100 group-hover/shelf:opacity-100"
            onClick={onShowAll}
          >
            Show all
          </button>
        )}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function playlistCover(item: { id: string; name: string }) {
  return (
    <span
      className="flex h-full w-full items-center justify-center text-3xl font-bold text-foreground/60"
      style={{ background: monoGradient(item.id + item.name) }}
    >
      {item.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function HomeView() {
  const library = useLibrary();
  const ui = useUi();
  const player = usePlayer();
  const [chip, setChip] = useState<Chip>("all");
  const region = useSettings((s) => s.region);
  const [greeting, setGreeting] = useState("Welcome back");
  const [trending, setTrending] = useState<{
    tracks: Track[];
    state: "loading" | "ready" | "error";
  }>({ tracks: [], state: "loading" });

  // set after mount so server and client markup match
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTrending((t) => ({ ...t, state: "loading" }));
    fetch(`/api/trending?region=${encodeURIComponent(region)}&limit=10`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: Track[] = Array.isArray(d.tracks) ? d.tracks : [];
        setTrending({ tracks: list, state: list.length ? "ready" : "error" });
      })
      .catch(() => {
        if (!cancelled) setTrending({ tracks: [], state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [region]);

  /* 100% local data — the home renders instantly, nothing to fetch */
  const recent = library.history.slice(0, 12).map((h) => h.track);
  const likedTracks = Object.values(library.liked)
    .sort((a, b) => b.likedAt - a.likedAt)
    .map((l) => l.track);
  const playlists = library.playlists;

  /* artist radios derived from history (needs 3+ plays of one artist) */
  const byArtist = new Map<string, Track[]>();
  for (const h of library.history) {
    const list = byArtist.get(h.track.artist) || [];
    list.push(h.track);
    byArtist.set(h.track.artist, list);
  }
  const radios = [...byArtist.entries()]
    .filter(([, ts]) => ts.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([artist, ts]) => ({ artist, tracks: ts.slice(0, 20) }));

  const likedItem: Item = {
    key: "liked",
    name: "Liked Songs",
    sub: `Playlist · ${likedTracks.length} songs`,
    cover: LIKED_COVER,
    onOpen: () => ui.navigate({ name: "library", tab: "liked" }),
    onPlay: () => likedTracks.length && player.playQueue(likedTracks, 0),
  };

  const playlistItems: Item[] = playlists.map((p) => ({
    key: `pl:${p.id}`,
    name: p.name,
    sub: `Playlist · ${p.tracks.length} songs`,
    cover: playlistCover(p),
    onOpen: () => ui.navigate({ name: "playlist", id: p.id, label: p.name }),
    onPlay: () => p.tracks.length && player.playQueue(p.tracks, 0),
  }));

  const radioItems: Item[] = radios.map((r) => ({
    key: `radio:${r.artist}`,
    name: `${r.artist} Radio`,
    sub: "Radio · from your history",
    cover: (
      <span
        className="flex h-full w-full items-center justify-center text-3xl font-bold text-foreground/60"
        style={{ background: monoGradient("radio:" + r.artist) }}
      >
        {r.artist.slice(0, 1).toUpperCase()}
      </span>
    ),
    onOpen: () => player.playQueue(r.tracks, 0),
    onPlay: () => player.playQueue(r.tracks, 0),
  }));

  const trackItems: Item[] = recent.map((t, i) => ({
    key: `t:${t.videoId}`,
    name: t.title,
    sub: t.artist,
    cover: <img src={t.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />,
    onOpen: () => player.playQueue(recent, i),
    onPlay: () => player.playQueue(recent, i),
  }));

  /* quick tiles — 8 like the real Spotify home */
  const tiles: Item[] =
    chip === "playlists"
      ? [likedItem, ...playlistItems].slice(0, 8)
      : chip === "music"
        ? [...radioItems, ...trackItems.slice(0, Math.max(0, 8 - radioItems.length))].slice(0, 8)
        : [likedItem, ...playlistItems, ...radioItems, ...trackItems.slice(0, 2)].slice(0, 8);

  const madeForYou: Item[] =
    chip === "music"
      ? [...radioItems, ...trackItems.slice(0, 6)].slice(0, 6)
      : [...playlistItems, ...radioItems].slice(0, 6);

  const recentlyPlayed: Item[] = chip === "playlists" ? [] : trackItems.slice(0, 6);

  const empty =
    recent.length === 0 && likedTracks.length === 0 && playlists.length === 0;

  const trendingBlock = (
    <section className="mt-10">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-[22px] font-bold tracking-tight">Trending · {region}</h2>
      </div>
      {trending.state === "loading" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="h-10 w-10 rounded-md" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      )}
      {trending.state === "error" && (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Trending charts aren&apos;t available right now. Your own music is still here.
        </p>
      )}
      {trending.state === "ready" && (
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          {trending.tracks.map((t, i) => (
            <TrackRow key={t.videoId} track={t} index={i} showIndex list={trending.tracks} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div>
      {/* greeting */}
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{greeting}</h1>
      </header>

      {/* filter pills — All / Music / Playlists like Spotify's All / Music / Podcasts */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {([
          ["all", "All"],
          ["music", "Music"],
          ["playlists", "Playlists"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
              chip === key
                ? "bg-foreground text-background"
                : "bg-foreground/10 text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setChip(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {empty ? (
        <>
          {/* the home keeps its Spotify structure even on a fresh profile —
              the Liked Songs tile always works, empty or not */}
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Tile item={likedItem} />
          </div>
          <div className="mt-8 rounded-2xl border bg-card p-8 text-center">
            <p className="font-semibold">Your home fills up as you listen.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Search for a song, artist or album to get started — liked songs, playlists
              and history will gather here.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Button onClick={() => ui.navigate({ name: "search" })}>
                <Search className="h-4 w-4" /> Find music
              </Button>
              <Button variant="outline" onClick={() => ui.setImportOpen(true)}>
                <ListPlus className="h-4 w-4" /> Import playlist
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          {tiles.length > 0 && (
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((t) => (
                <Tile key={t.key} item={t} />
              ))}
            </div>
          )}

          {madeForYou.length > 0 && (
            <Shelf
              title={chip === "playlists" ? "Your playlists" : chip === "music" ? "Made for you" : "Made For You"}
              onShowAll={() =>
                ui.navigate({ name: "library", tab: chip === "playlists" ? "playlists" : "liked" })
              }
            >
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {madeForYou.map((c) => (
                  <Card key={c.key} item={c} />
                ))}
              </div>
            </Shelf>
          )}

          {recentlyPlayed.length > 0 && (
            <Shelf title="Recently played" onShowAll={() => ui.navigate({ name: "library", tab: "history" })}>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {recentlyPlayed.map((c) => (
                  <Card key={c.key} item={c} />
                ))}
              </div>
            </Shelf>
          )}

          {/* getting-started row — quiet, below the fold */}
          <section className="mt-10 grid gap-4 sm:grid-cols-2">
            <button
              className="group flex items-center gap-4 rounded-2xl bg-card p-5 text-left transition-colors hover:bg-accent"
              onClick={() => ui.setImportOpen(true)}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 group-active:scale-90">
                <ListPlus className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold">Import a Spotify playlist</span>
                <span className="block text-sm text-muted-foreground">
                  Paste any public playlist URL — we search-match every track.
                </span>
              </span>
            </button>
            <button
              className="group flex items-center gap-4 rounded-2xl bg-card p-5 text-left transition-colors hover:bg-accent"
              onClick={() => ui.navigate({ name: "search" })}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 group-active:scale-90">
                <Search className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold">Search anything</span>
                <span className="block text-sm text-muted-foreground">
                  Songs, artists, albums — straight from YouTube Music.
                </span>
              </span>
            </button>
          </section>
        </>
      )}

      {chip !== "playlists" && trendingBlock}
    </div>
  );
}
