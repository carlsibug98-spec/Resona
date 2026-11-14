"use client";

import type { AlbumCard, ArtistPage, Track } from "@/lib/types";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { CoverArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { useAsyncData } from "@/lib/useFetch";

/** artist page — mockup hero language with the artist's real artwork */
export function ArtistView({ id, label }: { id: string; label?: string }) {
  const ui = useUi();
  const player = usePlayer();
  const page = useAsyncData(`artist:${id}`, async (signal) => {
    const r = await fetch(`/api/artist?id=${encodeURIComponent(id)}`, { signal });
    const d = await r.json();
    if (d.error) throw new Error("artist_failed");
    return d as ArtistPage;
  });
  const error = page.state === "error";
  const loaded = page.state === "ready" ? page.data : null;

  if (error)
    return (
      <div className="empty">
        <h3>Could not load this artist</h3>
        <p>The source didn&apos;t respond. Go back and try again.</p>
        <button className="btn2" onClick={() => ui.back()}>
          Go back
        </button>
      </div>
    );

  if (!loaded)
    return (
      <>
        <div className="phero" style={{ paddingBottom: 8 }}>
          <div className="cov" style={{ background: "var(--elev)", borderRadius: "50%" }} />
          <div>
            <div className="muted kicker">ARTIST</div>
            <h1>{label || "…"}</h1>
          </div>
        </div>
        <p className="muted pad-note">Loading songs…</p>
      </>
    );

  const songs: Track[] = loaded.songs || [];
  const shufflePlay = () => {
    if (!songs.length) return;
    player.toggleShuffle();
    player.playQueue(songs, Math.floor(Math.random() * songs.length), loaded.name);
  };

  return (
    <>
      <div className="phero">
        {loaded.thumb ? (
          <img
            src={loaded.thumb}
            alt={loaded.name}
            className="cov"
            style={{ width: 200, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div className="cov" style={{ width: 200, borderRadius: "50%" }}>
            <span>{loaded.name.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        <div>
          <div className="muted kicker">ARTIST</div>
          <h1>{loaded.name}</h1>
          {loaded.description && <div className="muted">{loaded.description}</div>}
        </div>
      </div>

      <div className="actions">
        <button
          className="bigplay"
          disabled={!songs.length}
          onClick={() => player.playQueue(songs, 0, loaded.name)}
          aria-label="Play"
        >
          <Icon name="play" fill />
        </button>
        <button className="iconbtn" onClick={shufflePlay} aria-label="Shuffle play" title="Shuffle play">
          <Icon name="shuffle" />
        </button>
      </div>

      {songs.length > 0 && (
        <div className="tlist">
          <TrackTableHead />
          {songs.map((t, i) => (
            <TrackRow key={t.videoId} track={t} index={i} list={songs} contextLabel={loaded.name} />
          ))}
        </div>
      )}

      {loaded.albums?.length > 0 && (
        <div className="section">
          <div className="section-h">
            <h2>Albums</h2>
          </div>
          <div className="shelf">
            {loaded.albums.slice(0, 8).map((a: AlbumCard) => (
              <button
                key={a.playlistId}
                className="card-item"
                onClick={() => ui.navigate({ name: "album", id: a.playlistId, label: a.title })}
              >
                <CoverArt className="cov" letter={a.title.slice(0, 1).toUpperCase()} hue={210} />
                <div className="t trunc">{a.title}</div>
                <div className="s trunc">{a.subtitle}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {loaded.singles?.length > 0 && (
        <div className="section">
          <div className="section-h">
            <h2>Singles</h2>
          </div>
          <div className="shelf">
            {loaded.singles.slice(0, 8).map((a: AlbumCard) => (
              <button
                key={a.playlistId}
                className="card-item"
                onClick={() => ui.navigate({ name: "album", id: a.playlistId, label: a.title })}
              >
                <CoverArt className="cov" letter={a.title.slice(0, 1).toUpperCase()} hue={40} />
                <div className="t trunc">{a.title}</div>
                <div className="s trunc">{a.subtitle}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
