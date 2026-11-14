"use client";

import { useMemo } from "react";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { CoverArt } from "@/lib/art";
import { Icon } from "@/components/Icon";

export function PlaylistView({ id }: { id: string }) {
  const ui = useUi();
  const player = usePlayer();
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));

  const totalMin = useMemo(() => {
    if (!playlist) return 0;
    const secs = playlist.tracks.reduce((a, t) => a + (t.duration || 210), 0);
    return Math.round(secs / 60);
  }, [playlist]);

  if (!playlist)
    return (
      <div className="empty">
        <Icon name="queue" />
        <h3>Playlist not found</h3>
        <p>It may have been deleted.</p>
        <button className="btn2" onClick={() => ui.navigate({ name: "library", tab: "playlists" })}>
          Back to Library
        </button>
      </div>
    );

  const tracks = playlist.tracks;
  const shufflePlay = () => {
    if (!tracks.length) return;
    player.toggleShuffle();
    player.playQueue(tracks, Math.floor(Math.random() * tracks.length), playlist.name);
  };

  return (
    <>
      <div className="phero">
        <CoverArt
          className="cov"
          letter={playlist.name.slice(0, 1).toUpperCase()}
          hue={280}
          track={tracks[0]}
        />
        <div>
          <div className="muted kicker">PLAYLIST</div>
          <h1>{playlist.name}</h1>
          <div className="muted">
            {tracks.length} songs{tracks.length ? ` · ~${totalMin} min` : ""}
          </div>
        </div>
      </div>
      <div className="actions">
        <button
          className="bigplay"
          disabled={!tracks.length}
          onClick={() => player.playQueue(tracks, 0, playlist.name)}
          aria-label="Play"
        >
          <Icon name="play" fill />
        </button>
        <button className="iconbtn" onClick={shufflePlay} aria-label="Shuffle play" title="Shuffle play">
          <Icon name="shuffle" />
        </button>
        <button
          className="iconbtn"
          aria-label="More"
          title="More"
          onClick={() =>
            useUi.getState().openModal({ kind: "playlistMenu", id: playlist.id, name: playlist.name })
          }
        >
          <Icon name="more" />
        </button>
      </div>
      {tracks.length ? (
        <div className="tlist">
          <TrackTableHead />
          {tracks.map((t, i) => (
            <TrackRow
              key={t.videoId}
              track={t}
              index={i}
              list={tracks}
              contextLabel={playlist.name}
            />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon name="queue" />
          <h3>This playlist is empty</h3>
          <p>Add songs from search with the ⋯ menu.</p>
          <button className="btn2" onClick={() => ui.navigate({ name: "search" })}>
            Find songs
          </button>
        </div>
      )}
    </>
  );
}
