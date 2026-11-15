"use client";

import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { CoverArt } from "@/lib/art";
import { Icon, type IconName } from "@/components/Icon";
import { usePlayer } from "@/stores/player";

type Tab = "liked" | "playlists" | "history" | "downloads";

function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      <p>{text}</p>
      {actionLabel && onAction && (
        <button className="btn2" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function LibraryView({ tab = "liked" }: { tab?: Tab }) {
  const ui = useUi();
  const player = usePlayer();
  const library = useLibrary();

  const likedIds = Object.values(library.liked)
    .sort((a, b) => b.likedAt - a.likedAt)
    .map((l) => l.track);
  const history = library.history.map((h) => h.track);
  const downloads = Object.values(library.downloads)
    .filter((d) => d.complete)
    .sort((a, b) => b.downloadedAt - a.downloadedAt)
    .map((d) => d.track);

  const tabs: [Tab, string, IconName][] = [
    ["liked", "Liked", "heart"],
    ["playlists", "Playlists", "queue"],
    ["history", "History", "bars"],
    ["downloads", "Downloads", "download"],
  ];

  const setTab = (t: Tab) => ui.replace({ name: "library", tab: t });

  let body: React.ReactNode = null;

  if (tab === "liked") {
    body = likedIds.length ? (
      <>
        <div className="actions pad">
          <button
            className="bigplay"
            onClick={() => player.playQueue(likedIds, 0, "Liked songs")}
            aria-label="Play all"
          >
            <Icon name="play" fill />
          </button>
          <span className="muted">{likedIds.length} liked tracks</span>
        </div>
        <div className="tlist">
          <TrackTableHead />
          {likedIds.map((t, i) => (
            <TrackRow key={t.videoId} track={t} index={i} list={likedIds} contextLabel="Liked songs" />
          ))}
        </div>
      </>
    ) : (
      <EmptyState
        icon="heart"
        title="No liked songs yet"
        text="Tap the heart on any track to build your collection."
        actionLabel="Find songs"
        onAction={() => ui.navigate({ name: "search" })}
      />
    );
  }

  if (tab === "playlists") {
    body = (
      <div className="shelf top-gap">
        <button
          className="card-item create"
          onClick={() => useUi.getState().openModal({ kind: "createPlaylist" })}
        >
          <span className="iconbtn plus">
            <Icon name="plus" />
          </span>
          <b>Create playlist</b>
        </button>
        {library.playlists.map((p) => (
          <button
            key={p.id}
            className="card-item"
            onClick={() => ui.navigate({ name: "playlist", id: p.id, label: p.name })}
          >
            <CoverArt className="cov" letter={p.name.slice(0, 1).toUpperCase()} hue={280} />
            <div className="t trunc">{p.name}</div>
            <div className="s">Playlist · {p.tracks.length} songs</div>
          </button>
        ))}
      </div>
    );
  }

  if (tab === "history") {
    body = history.length ? (
      <div className="tlist top-gap">
        <TrackTableHead />
        {history.map((t, i) => (
          <TrackRow key={t.videoId} track={t} index={i} list={history} contextLabel="History" />
        ))}
      </div>
    ) : (
      <EmptyState
        icon="bars"
        title="Nothing played yet"
        text="Songs you play show up here, newest first."
        actionLabel="Find songs"
        onAction={() => ui.navigate({ name: "search" })}
      />
    );
  }

  if (tab === "downloads") {
    body = downloads.length ? (
      <>
        <p className="muted pad-note">Available offline — no connection needed.</p>
        <div className="tlist">
          <TrackTableHead />
          {downloads.map((t, i) => (
            <TrackRow key={t.videoId} track={t} index={i} list={downloads} contextLabel="Downloads" />
          ))}
        </div>
      </>
    ) : (
      <EmptyState
        icon="download"
        title="No downloads yet"
        text="Download a song to listen offline. Downloads stay on this device."
        actionLabel="Find songs"
        onAction={() => ui.navigate({ name: "search" })}
      />
    );
  }

  return (
    <>
      <div className="hero tight">
        <h1>Library</h1>
      </div>
      <div className="tabs">
        {tabs.map(([k, l, icon]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            <Icon name={icon} className="sm" />
            {l}
          </button>
        ))}
      </div>
      {body}
    </>
  );
}
