"use client";

import type { Track } from "@/lib/types";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { CoverArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { useAsyncData } from "@/lib/useFetch";

interface AlbumData {
  name?: string;
  tracks: Track[];
}

/** album / remote playlist — mockup hero language */
export function AlbumView({ id, label }: { id: string; label?: string }) {
  const ui = useUi();
  const player = usePlayer();
  const album = useAsyncData(`album:${id}`, async (signal) => {
    const r = await fetch(`/api/playlist?id=${encodeURIComponent(id)}`, { signal });
    const d = await r.json();
    if (d.error) throw new Error("album_failed");
    return { name: (d.name || label) as string | undefined, tracks: (d.tracks || []) as Track[] };
  });

  if (album.state === "error")
    return (
      <div className="empty">
        <h3>Could not load this album</h3>
        <p>The source didn&apos;t respond. Go back and try again.</p>
        <button className="btn2" onClick={() => ui.back()}>
          Go back
        </button>
      </div>
    );

  const data: AlbumData | null = album.state === "ready" ? album.data : null;
  const name = data?.name || label || "";
  const tracks = data?.tracks ?? [];

  return (
    <>
      <div className="phero">
        <CoverArt className="cov" letter={(name || "?").slice(0, 1).toUpperCase()} hue={220} track={tracks[0]} />
        <div>
          <div className="muted kicker">ALBUM</div>
          <h1>{name || "…"}</h1>
          <div className="muted">
            {album.state === "loading" ? "Loading…" : `${tracks.length} songs`}
          </div>
        </div>
      </div>
      <div className="actions">
        <button
          className="bigplay"
          disabled={!tracks.length}
          onClick={() => player.playQueue(tracks, 0, name)}
          aria-label="Play"
        >
          <Icon name="play" fill />
        </button>
        <button
          className="iconbtn"
          disabled={!tracks.length}
          aria-label="Shuffle play"
          title="Shuffle play"
          onClick={() => {
            player.toggleShuffle();
            player.playQueue(tracks, Math.floor(Math.random() * tracks.length), name);
          }}
        >
          <Icon name="shuffle" />
        </button>
      </div>
      {album.state === "loading" ? (
        <p className="muted pad-note">Loading tracks…</p>
      ) : tracks.length ? (
        <div className="tlist">
          <TrackTableHead />
          {tracks.map((t, i) => (
            <TrackRow key={t.videoId} track={t} index={i} list={tracks} contextLabel={name} />
          ))}
        </div>
      ) : (
        <p className="muted pad-note">No tracks found for this album.</p>
      )}
    </>
  );
}
