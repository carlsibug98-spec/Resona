"use client";

import { useEffect, useState } from "react";
import type { Track } from "@/lib/types";
import { TrackRow } from "@/components/track/TrackRow";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Play, Shuffle } from "lucide-react";

// Album (or remote playlist) fetched from YouTube Music by browse id
export function AlbumView({ id, label }: { id: string; label?: string }) {
  const ui = useUi();
  const [name, setName] = useState(label || "");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const r = await fetch(`/api/playlist?id=${encodeURIComponent(id)}`);
        const d = await r.json();
        if (cancelled) return;
        if (d.error) setError(true);
        else {
          setTracks(d.tracks || []);
          if (d.name) setName(d.name);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
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
        Could not load this album.{" "}
        <Button variant="link" className="px-1" onClick={() => ui.back()}>
          Go back
        </Button>
      </div>
    );

  return (
    <div className="space-y-6">
      <button
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => ui.back()}
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Album</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{name || "Album"}</h1>
        <div className="mt-4 flex gap-2">
          <Button
            className="rounded-full"
            disabled={!tracks.length}
            onClick={() => usePlayer.getState().playQueue(tracks, 0, name)}
          >
            <Play className="h-4 w-4 fill-current" /> Play
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={!tracks.length}
            onClick={() => {
              usePlayer.getState().toggleShuffle();
              usePlayer.getState().playQueue(tracks, Math.floor(Math.random() * tracks.length), name);
            }}
          >
            <Shuffle className="h-4 w-4" /> Shuffle
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
          {tracks.map((t, i) => (
            <TrackRow key={t.videoId} track={t} index={i} showIndex list={tracks} />
          ))}
        </div>
      )}
    </div>
  );
}
