"use client";

import { useEffect, useState } from "react";
import { useUi, type View } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { Icon, type IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { plGrad } from "@/lib/art";
import { toast } from "@/stores/toast";

type LibChip = "all" | "playlists" | "liked" | "downloads";

/** mockup first-time sidebar cards: import promo (dismissible for the
 * session), create-playlist nudge, find-artists nudge */
function NewUserCards() {
  const ui = useUi();
  const [hideImport, setHideImport] = useState(false);
  return (
    <div className="nu-cards">
      {!hideImport && (
        <div className="nu-promo">
          <button
            className="nu-x"
            onClick={() => setHideImport(true)}
            aria-label="Dismiss"
          >
            <Icon name="x" className="xs" />
          </button>
          <h3>Bring your music from other apps</h3>
          <p>Import your playlists, songs and artists in one step.</p>
          <button className="pill" onClick={() => ui.openModal({ kind: "import" })}>
            Import library
          </button>
        </div>
      )}
      <div className="nu-side-card">
        <h4>Create your first playlist</h4>
        <p>It&apos;s easy, we&apos;ll help you put songs together.</p>
        <button className="pill" onClick={() => ui.openModal({ kind: "createPlaylist" })}>
          Create playlist
        </button>
      </div>
      <div className="nu-side-card">
        <h4>Let&apos;s find some artists to follow</h4>
        <p>We&apos;ll keep you updated on new releases.</p>
        <button className="pill" onClick={() => toast("Artist follows arrive with the next build")}>
          Find artists
        </button>
      </div>
    </div>
  );
}

/** desktop sidebar: main nav card + your-library card — mockup verbatim */
export function Sidebar() {
  const ui = useUi();
  const view = ui.view();
  const likedCount = useLibrary((s) => Object.keys(s.liked).length);
  const playlists = useLibrary((s) => s.playlists);
  const downloads = useLibrary((s) => s.downloads);
  const isNew = useSettings((s) => s.onboarding) === "new";
  const [chip, setChip] = useState<LibChip>("all");
  const collapsed = ui.libCollapsed;

  const dlCount = Object.values(downloads).filter((d) => d.complete).length;
  const chips: [LibChip, string][] = [
    ["all", "All"],
    ["playlists", "Playlists"],
    ["liked", "Liked"],
    ...(dlCount > 0 ? ([["downloads", "Downloads"]] as [LibChip, string][]) : []),
  ];

  const showLiked = (chip === "all" || chip === "liked" || chip === "playlists") && (!isNew || likedCount > 0);
  const showPlaylists = chip === "all" || chip === "playlists";
  const showDownloads = (chip === "all" || chip === "downloads") && dlCount > 0;

  const rows: React.ReactNode[] = [];
  if (isNew && !collapsed) rows.push(<NewUserCards key="nu" />);
  if (showLiked) {
    rows.push(
      <button
        key="liked"
        data-tip={collapsed ? "Liked songs" : undefined}
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
          data-tip={collapsed ? p.name : undefined}
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
        data-tip={collapsed ? "Downloads" : undefined}
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
      <div className="brandrow">
        <Logo />
      </div>
      {!collapsed && <nav className="card nav" aria-label="Main">
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
      </nav>}
      <section className="card lib">
        <div className="lib-head">
          <button
            className="lib-toggle"
            onClick={() => ui.toggleLib()}
            aria-label={collapsed ? "Expand Your Library" : "Collapse Your Library"}
            data-tip={collapsed ? "Expand Your Library" : "Collapse Your Library"}
          >
            <Icon name="library" className="sm" />
            {!collapsed && <span>Your Library</span>}
          </button>
          {!collapsed && (
            <button
              className="iconbtn"
              onClick={() => useUi.getState().openModal({ kind: "createPlaylist" })}
              aria-label="Create playlist"
              data-tip="Create playlist"
            >
              <Icon name="plus" className="sm" />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="chips">
            {chips.map(([k, label]) => (
              <button key={k} className={`chip${chip === k ? " on" : ""}`} onClick={() => setChip(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
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
