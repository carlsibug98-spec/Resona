"use client";

import { useEffect, type CSSProperties } from "react";
import { useUi, type View } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { HomeView } from "@/components/views/HomeView";
import { SearchView } from "@/components/views/SearchView";
import { ArtistView } from "@/components/views/ArtistView";
import { AlbumView } from "@/components/views/AlbumView";
import { PlaylistView } from "@/components/views/PlaylistView";
import { LibraryView } from "@/components/views/LibraryView";
import { TrendingView } from "@/components/views/TrendingView";
import { SettingsView } from "@/components/views/SettingsView";
import { PlayerBar } from "@/components/player/PlayerBar";
import { NowPlayingPanel } from "@/components/player/NowPlayingPanel";
import { NowFull } from "@/components/player/NowFull";
import { QueueDrawer } from "@/components/player/QueueDrawer";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { TaskbarControls } from "@/components/TaskbarControls";
import { Sidebar, MobileNav } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { ModalHost } from "@/components/ModalHost";
import { ToastHost } from "@/components/ToastHost";
import { SnackHost } from "@/components/SnackHost";
import { TooltipLayer } from "@/components/TooltipLayer";
import { IconSprite } from "@/components/Icon";
import { hueFor } from "@/lib/art";
import { removeStarterContent } from "@/lib/unseed";
import { hydrateLibrary } from "@/lib/library-sync";
import type { Track } from "@/lib/types";

function MainView({ view }: { view: View }) {
  switch (view.name) {
    case "home":
      return <HomeView />;
    case "search":
      return <SearchView initialQuery={view.q} />;
    case "artist":
      return <ArtistView id={view.id} label={view.label} />;
    case "album":
      return <AlbumView id={view.id} label={view.label} subtitle={view.subtitle} />;
    case "playlist":
      return <PlaylistView id={view.id} />;
    case "library":
      return <LibraryView tab={view.tab} />;
    case "trending":
      return <TrendingView />;
    case "settings":
      return <SettingsView />;
    default:
      return <HomeView />;
  }
}

export function AppShell() {
  const ui = useUi();
  const view = ui.views[ui.views.length - 1];
  const viewKey =
    view.name +
    ("id" in view ? `:${view.id}` : "") +
    ("tab" in view ? `:${view.tab}` : "") +
    ("q" in view && view.q ? `:q=${view.q}` : "");
  const track = usePlayer((s) => s.queue[s.index] as Track | undefined);

  // browser back button support
  useEffect(() => {
    const onPop = () => ui.back();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [ui]);

  useEffect(() => {
    window.history.pushState({ resona: true }, "");
  }, [ui.views.length]);

  // v1.6.9 one-time migration: remove the old starter content (seeded
  // likes / "Late night" playlist / sample history) from installs that
  // ran a pre-1.6.9 version. Runs to completion before hydration so the
  // server copy is cleaned and can't merge the seeds back — the mirror
  // fetches must land before /api/library is read.
  useEffect(() => {
    void (async () => {
      await removeStarterContent();
      await hydrateLibrary();
    })();
  }, []);

  // the mockup's ambient hue follows the playing track
  useEffect(() => {
    const t = usePlayer.getState().current();
    const hue = t ? hueFor(t) : 18;
    document.documentElement.style.setProperty("--hue", String(hue));
  }, [track?.videoId]);

  // Esc closes panel / full screen / modal (modal handles its own Esc too)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const uiState = useUi.getState();
      if (uiState.modal) return; // modal host closes itself
      if (uiState.fullPlayer) {
        uiState.setFullPlayer(false);
        uiState.setNfMode(null);
      } else if (uiState.panel) {
        uiState.closePanel();
      } else if (uiState.queueDrawer) {
        uiState.setQueueDrawer(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // narrow windows: opening the queue or now-playing folds the library to its rail,
  // so the main column keeps a usable width
  useEffect(() => {
    if ((ui.queueDrawer || ui.panel) && window.innerWidth < 1180) {
      useUi.getState().setLibCollapsed(true);
    }
  }, [ui.queueDrawer, ui.panel]);

  // overlay scrollbars: a scroll area shows its thumb only while it's moving
  // (the hover rule lives in CSS), then fades back out
  useEffect(() => {
    const timers = new WeakMap<HTMLElement, number>();
    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      el.classList.add("is-scrolling");
      const prev = timers.get(el);
      if (prev) window.clearTimeout(prev);
      timers.set(el, window.setTimeout(() => el.classList.remove("is-scrolling"), 800));
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  return (
    <div
      className={`app${ui.queueDrawer || ui.panel ? " qd-open" : ""}${ui.libCollapsed ? " lib-collapsed" : ""}`}
      style={{ "--qdw": `${ui.queueWidth}px` } as CSSProperties}
    >
      <IconSprite />
      <PlayerProvider />
      {/* prev/play/next on the Windows taskbar preview; dock menu on macOS */}
      <TaskbarControls />

      <TopBar />

      <aside className={`side${ui.libCollapsed ? " collapsed" : ""}`}>
        <Sidebar />
      </aside>

      <main className="main" id="main">
        <div className="content main-inner" key={viewKey}>
          <MainView view={view} />
        </div>
      </main>

      {/* Spotify-style: hidden, the Now Playing view stays as a peek rail —
          a narrow dark sliver (~28px) hugging the right edge with a chevron;
          hovering it breathes it wider. It lives outside the scrolling .main
          so it never scrolls away and never gets clipped. */}
      {!ui.panel && !ui.queueDrawer && (
        <button
          className="npp-peek"
          onClick={() => useUi.getState().openPanel("queue")}
          aria-label="Show Now Playing view"
          data-tip="Show Now Playing view"
        >
          <span className="npp-peek-glow" aria-hidden="true" />
          <Icon name="chev-left" />
        </button>
      )}

      <PlayerBar />

      <MobileNav />
      <NowPlayingPanel />
      <NowFull />
      <QueueDrawer />
      <ModalHost />
      <ToastHost />
      <SnackHost />
      <TooltipLayer />
    </div>
  );
}
