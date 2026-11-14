"use client";

import { useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { TrackCardRow } from "@/components/track/TrackCard";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ListPlus,
  Play,
  Search,
} from "lucide-react";
import { monoGradient } from "@/lib/format";
import { cn } from "@/lib/utils";

type Chip = "all" | "music" | "playlists";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const PLAY_OVERLAY =
  "absolute bottom-2 right-2 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-float transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-active:scale-90 focus-visible:translate-y-0 focus-visible:opacity-100";

interface CardDef {
  key: string;
  title: string;
  sub: string;
  cover: React.ReactNode;
  onOpen: () => void;
  onPlay: () => void;
}

function GridCard({ card }: { card: CardDef }) {
  return (
    <div className="group relative rounded-xl p-3 transition-colors duration-200 hover:bg-card">
      <div className="relative">
        <button className="block w-full text-left" onClick={card.onOpen} aria-label={card.title}>
          <span className="relative block aspect-square overflow-hidden rounded-lg bg-muted shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
            {card.cover}
          </span>
          <span className="mt-3 block truncate text-sm font-semibold">{card.title}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{card.sub}</span>
        </button>
        <button className={PLAY_OVERLAY} onClick={card.onPlay} aria-label={`Play ${card.title}`}>
          <Play className="h-4 w-4 translate-x-[1px] fill-current" />
        </button>
      </div>
    </div>
  );
}

export function HomeView() {
  const library = useLibrary();
  const ui = useUi();
  const player = usePlayer();
  const shelfRef = useRef<HTMLDivElement>(null);
  const [chip, setChip] = useState<Chip>("all");

  // 100% local data — the home renders instantly, nothing to fetch.
  const recent = library.history.slice(0, 12).map((h) => h.track);
  const likedTracks = Object.values(library.liked)
    .sort((a, b) => b.likedAt - a.likedAt)
    .map((l) => l.track);

  // artist radios derived from history (needs 3+ plays of one artist)
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

  const scrollShelf = (dir: 1 | -1) =>
    shelfRef.current?.scrollBy({
      left: dir * (shelfRef.current.clientWidth * 0.8),
      behavior: "smooth",
    });

  const likedCard: CardDef = {
    key: "liked",
    title: "Liked Songs",
    sub: `Playlist · ${likedTracks.length} songs`,
    cover: (
      <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-500 via-neutral-700 to-neutral-950 text-foreground">
        <Heart className="h-9 w-9 fill-current" />
      </span>
    ),
    onOpen: () => ui.navigate({ name: "library", tab: "liked" }),
    onPlay: () => likedTracks.length && player.playQueue(likedTracks, 0),
  };

  const playlistCards: CardDef[] = library.playlists.map((p) => ({
    key: `pl:${p.id}`,
    title: p.name,
    sub: `Playlist · ${p.tracks.length} songs`,
    cover: (
      <span
        className="flex h-full w-full items-center justify-center text-3xl font-bold text-foreground/60"
        style={{ background: monoGradient(p.id + p.name) }}
      >
        {p.name.slice(0, 1).toUpperCase()}
      </span>
    ),
    onOpen: () => ui.navigate({ name: "playlist", id: p.id, label: p.name }),
    onPlay: () => p.tracks.length && player.playQueue(p.tracks, 0),
  }));

  const radioCards: CardDef[] = radios.map((r) => ({
    key: `radio:${r.artist}`,
    title: `${r.artist} Radio`,
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

  const trackCards: CardDef[] = recent.map((t, i) => ({
    key: `t:${t.videoId}`,
    title: t.title,
    sub: t.artist,
    cover: <img src={t.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />,
    onOpen: () => player.playQueue(recent, i),
    onPlay: () => player.playQueue(recent, i),
  }));

  const cards: CardDef[] =
    chip === "playlists"
      ? [likedCard, ...playlistCards]
      : chip === "music"
        ? [...radioCards, ...trackCards.slice(0, 10)]
        : [
            likedCard,
            ...playlistCards.slice(0, 6),
            ...radioCards.slice(0, 2),
            ...trackCards.slice(0, Math.max(0, 12 - 1 - Math.min(6, playlistCards.length) - Math.min(2, radioCards.length))),
          ];

  const empty = recent.length === 0 && likedTracks.length === 0 && library.playlists.length === 0;

  return (
    <div>
      {/* filter chips — like Spotify's All / Music / Podcasts row */}
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
                : "bg-card text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setChip(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="mt-8 rounded-2xl border bg-card p-8 text-center">
          <p className="font-semibold">{greeting()}. Your home fills up as you listen.</p>
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
      ) : (
        <>
          {cards.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {cards.map((c) => (
                <GridCard key={c.key} card={c} />
              ))}
            </div>
          )}

          {chip !== "playlists" && recent.length > 0 && (
            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight md:text-2xl">Jump back in</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => ui.navigate({ name: "library", tab: "history" })}
                  >
                    View all
                  </Button>
                  <button
                    className="hidden h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground transition-colors hover:text-foreground sm:flex"
                    onClick={() => scrollShelf(-1)}
                    aria-label="Scroll back"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    className="hidden h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground transition-colors hover:text-foreground sm:flex"
                    onClick={() => scrollShelf(1)}
                    aria-label="Scroll forward"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div ref={shelfRef} className="mt-3">
                <TrackCardRow tracks={recent} />
              </div>
            </section>
          )}

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
    </div>
  );
}
