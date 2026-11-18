"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { CoverArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import {
  cancelBatch,
  downloadPlaylist,
  getBatch,
  subscribeBatches,
  isBatchActive,
} from "@/lib/batch-download";

/** a version counter bumped by every batch-store change — the sync store
 *  subscribes to it, so the table re-renders exactly once per batch step */
let batchesVersion = 0;
subscribeBatches(() => {
  batchesVersion++;
});

export function PlaylistView({ id }: { id: string }) {
  const ui = useUi();
  const player = usePlayer();
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));
  const downloads = useLibrary((s) => s.downloads);
  // batch progress lives in a module-level store (per-track chunks must
  // not re-render the whole playlist table) — subscribe via sync store
  useSyncExternalStore(subscribeBatches, () => batchesVersion, () => 0);

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
  const batch = getBatch(playlist.id);
  const active = batch ? isBatchActive(playlist.id) : false;
  const savedCount = tracks.filter((t) => downloads[t.videoId]).length;
  const allSaved = tracks.length > 0 && savedCount === tracks.length;

  const shufflePlay = () => {
    if (!tracks.length) return;
    player.toggleShuffle();
    player.playQueue(tracks, Math.floor(Math.random() * tracks.length), playlist.name);
  };

  const startDownload = () => {
    void downloadPlaylist(playlist.id, tracks);
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
            {savedCount > 0 ? ` · ${savedCount} downloaded` : ""}
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
        {allSaved ? (
          <button className="iconbtn" disabled aria-label="All songs downloaded" title="All songs downloaded">
            <Icon name="check" />
          </button>
        ) : active && batch ? (
          <button
            className="iconbtn"
            onClick={() => cancelBatch(playlist.id)}
            aria-label="Cancel download"
            title="Cancel download"
          >
            <Icon name="x" />
          </button>
        ) : (
          <button
            className="iconbtn"
            onClick={startDownload}
            aria-label="Download all"
            title="Download all"
          >
            <Icon name="download" />
          </button>
        )}
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

      {/* batch progress — Musify's "12/30 · downloading <song>" line */}
      {batch && (active || batch.failed > 0) && (
        <div className="dl-batch" role="status">
          <div className="dl-batch-top">
            <span className="trunc">
              {batch.cancelled
                ? "Cancelling…"
                : batch.currentTitle
                  ? `Downloading ${batch.currentTitle}`
                  : "Downloading…"}
            </span>
            <span className="muted">
              {batch.completed}/{batch.total}
              {batch.failed > 0 ? ` · ${batch.failed} failed` : ""}
            </span>
          </div>
          <div className="dl-batch-bar" aria-hidden="true">
            <span
              style={{
                width: `${Math.round(((batch.completed + batch.failed) / batch.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

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
