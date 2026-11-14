"use client";

import { useEffect, useState } from "react";
import type { AlbumCard, ArtistPage, Track } from "@/lib/types";
import { TrackRow } from "@/components/track/TrackRow";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Play, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ArtistView({ id, label }: { id: string; label?: string }) {
  const ui = useUi();
  const [page, setPage] = useState<ArtistPage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setPage(null);
      setError(false);
      try {
        const r = await fetch(`/api/artist?id=${encodeURIComponent(id)}`);
        const d = await r.json();
        if (cancelled) return;
        if (d.error) setError(true);
        else setPage(d);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error)
    return (
      <div className="rounded-xl border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        Could not load this artist.{" "}
        <Button variant="link" className="px-1" onClick={() => ui.back()}>
          Go back
        </Button>
      </div>
    );

  if (!page)
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );

  const songs: Track[] = page.songs || [];
  const all = [...songs];

  return (
    <div className="space-y-8">
      <button
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => ui.back()}
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {page.thumb ? (
          <img
            src={page.thumb}
            alt={page.name}
            className="h-36 w-36 rounded-full object-cover bg-muted shadow-lg"
          />
        ) : (
          <div className="h-36 w-36 rounded-full bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Artist</div>
          <h1 className="mt-1 truncate text-3xl font-bold tracking-tight">
            {page.name || label}
          </h1>
          <div className="mt-4 flex gap-2">
            <Button
              className="rounded-full"
              onClick={() => all.length && usePlayer.getState().playQueue(all, 0, page.name)}
              disabled={!all.length}
            >
              <Play className="h-4 w-4 fill-current" /> Play
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (!all.length) return;
                usePlayer.getState().toggleShuffle();
                usePlayer.getState().playQueue(all, Math.floor(Math.random() * all.length), page.name);
              }}
              disabled={!all.length}
            >
              <Shuffle className="h-4 w-4" /> Shuffle
            </Button>
          </div>
        </div>
      </div>

      {songs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Popular tracks</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
            {songs.slice(0, 10).map((t, i) => (
              <TrackRow key={t.videoId} track={t} index={i} showIndex list={songs} />
            ))}
          </div>
        </section>
      )}

      {page.albums.length > 0 && <AlbumShelf title="Albums" albums={page.albums} />}
      {page.singles.length > 0 && <AlbumShelf title="Singles & EPs" albums={page.singles} />}
    </div>
  );
}

function AlbumShelf({ title, albums }: { title: string; albums: AlbumCard[] }) {
  const ui = useUi();
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {albums.map((a) => (
          <button
            key={a.playlistId + a.title}
            className="group w-36 shrink-0 text-left sm:w-44"
            onClick={() =>
              ui.navigate({ name: "album", id: a.playlistId, label: a.title, thumb: a.thumb, subtitle: a.subtitle })
            }
          >
            <div className="overflow-hidden rounded-xl bg-muted aspect-square">
              <img
                src={a.thumb}
                alt={a.title}
                loading="lazy"
                className={cn("h-full w-full object-cover transition-transform duration-300 group-hover:scale-105")}
              />
            </div>
            <div className="mt-2 truncate text-sm font-medium">{a.title}</div>
            <div className="truncate text-xs text-muted-foreground">{a.subtitle}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
