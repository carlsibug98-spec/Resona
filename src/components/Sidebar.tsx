"use client";

import { useEffect, useState } from "react";
import { useUi, type View } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { Icon, type IconName } from "@/components/Icon";
import { plGrad } from "@/lib/art";

type LibChip = "all" | "playlists" | "liked" | "downloads";

/** desktop sidebar: main nav card + your-library card — mockup verbatim */
export function Sidebar() {
  const ui = useUi();
  const view = ui.view();
  const likedCount = useLibrary((s) => Object.keys(s.liked).length);
  const playlists = useLibrary((s) => s.playlists);
  const downloads = useLibrary((s) => s.downloads);
  const [chip, setChip] = useState<LibChip>("all");

  const dlCount = Object.values(downloads).filter((d) => d.complete).length;
  const chips: [LibChip, string][] = [
    ["all", "All"],
    ["playlists", "Playlists"],
    ["liked", "Liked"],
    ...(dlCount > 0 ? ([["downloads", "Downloads"]] as [LibChip, string][]) : []),
  ];

  const showLiked = chip === "all" || chip === "liked" || chip === "playlists";
  const showPlaylists = chip === "all" || chip === "playlists";
  const showDownloads = (chip === "all" || chip === "downloads") && dlCount > 0;

  const rows: React.ReactNode[] = [];
  if (showLiked) {
    rows.push(
      <button
        key="liked"
        className={`row-lib${view.name === "library" && view.tab === "liked" ? " on" : ""}`}
        onClick={() => ui.navigate({ name: "library", tab: "liked" })}
      >
        <span className="mini heart">
          <Icon name="heart" fill />
        </span>
        <span className="txt">
          <span className="nm trunc">Liked songs</span>
          <span className="sub">Playlist · {likedCount} songs</span>
        </span>
      </button>
    );
  }
  if (showPlaylists) {
    for (const p of playlists) {
      rows.push(
        <button
          key={p.id}
          className={`row-lib${view.name === "playlist" && view.id === p.id ? " on" : ""}`}
          onClick={() => ui.navigate({ name: "playlist", id: p.id, label: p.name })}
        >
          <span className="mini" style={{ background: plGrad(p.id.length * 70) }}>
            <span>{p.name.slice(0, 1).toUpperCase()}</span>
          </span>
          <span className="txt">
            <span className="nm trunc">{p.name}</span>
            <span className="sub">Playlist · {p.tracks.length} songs</span>
          </span>
        </button>
      );
    }
  }
  if (showDownloads) {
    rows.push(
      <button
        key="downloads"
        className={`row-lib${view.name === "library" && view.tab === "downloads" ? " on" : ""}`}
        onClick={() => ui.navigate({ name: "library", tab: "downloads" })}
      >
        <span className="mini" style={{ background: "var(--elev)" }}>
          <Icon name="download" />
        </span>
        <span className="txt">
          <span className="nm trunc">Downloads</span>
          <span className="sub">{dlCount} saved offline</span>
        </span>
      </button>
    );
  }
  if (!rows.length) {
    rows.push(
      <p key="empty" className="sub pad-note">
        Nothing here yet. Like a song, or import a playlist.
      </p>
    );
  }

  const navItems: { view: View; label: string; icon: IconName }[] = [
    { view: { name: "home" }, label: "Home", icon: "home" },
    { view: { name: "search" }, label: "Search", icon: "search" },
    { view: { name: "library", tab: "liked" }, label: "Library", icon: "library" },
  ];

  return (
    <>
      <nav className="card nav" aria-label="Main">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`navbtn${view.name === item.view.name ? " on" : ""}`}
            onClick={() => ui.navigate(item.view)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>
      <section className="card lib">
        <div className="lib-head">
          <b>
            <Icon name="library" className="sm" /> Your Library
          </b>
          <button
            className="iconbtn"
            onClick={() => useUi.getState().openModal({ kind: "createPlaylist" })}
            aria-label="Create playlist"
            title="Create playlist"
          >
            <Icon name="plus" className="sm" />
          </button>
        </div>
        <div className="chips">
          {chips.map(([k, label]) => (
            <button key={k} className={`chip${chip === k ? " on" : ""}`} onClick={() => setChip(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="liblist">{rows}</div>
      </section>
    </>
  );
}

/** mobile bottom navigation — mockup verbatim */
export function MobileNav() {
  const view = useUi((s) => s.views[s.views.length - 1]);
  const navigate = useUi((s) => s.navigate);
  const items: { view: View; label: string; icon: IconName }[] = [
    { view: { name: "home" }, label: "Home", icon: "home" },
    { view: { name: "search" }, label: "Search", icon: "search" },
    { view: { name: "library", tab: "liked" }, label: "Library", icon: "library" },
    { view: { name: "settings" }, label: "Settings", icon: "gear" },
  ];
  return (
    <nav className="mnav" aria-label="Mobile">
      {items.map((item) => (
        <button
          key={item.label}
          className={view.name === item.view.name ? "on" : ""}
          onClick={() => navigate(item.view)}
        >
          <Icon name={item.icon} />
          {item.label}
        </button>
      ))}
    </nav>
  );
}
