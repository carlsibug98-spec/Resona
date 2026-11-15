"use client";

import { useEffect } from "react";
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
import { Sidebar, MobileNav } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ModalHost } from "@/components/ModalHost";
import { ToastHost } from "@/components/ToastHost";
import { SnackHost } from "@/components/SnackHost";
import { IconSprite } from "@/components/Icon";
import { hueFor } from "@/lib/art";
import { applyStarterContent } from "@/lib/seed";
import type { Track } from "@/lib/types";

function MainView({ view }: { view: View }) {
  switch (view.name) {
    case "home":
      return <HomeView />;
    case "search":
      return <SearchView />;
    case "artist":
      return <ArtistView id={view.id} label={view.label} />;
    case "album":
      return <AlbumView id={view.id} label={view.label} />;
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
  const viewKey = view.name + ("id" in view ? `:${view.id}` : "") + ("tab" in view ? `:${view.tab}` : "");
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

  // first run: seed the mockup's starter content (never overwrites real data)
  useEffect(() => {
    void applyStarterContent();
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

  return (
    <div className="app">
      <IconSprite />
      <PlayerProvider />

      <aside className="side">
        <Sidebar />
      </aside>

      <main className="main" id="main">
        <TopBar />
        <div className="content" key={viewKey}>
          <MainView view={view} />
        </div>
      </main>

      <PlayerBar />

      <MobileNav />
      <NowPlayingPanel />
      <NowFull />
      <QueueDrawer />
      <ModalHost />
      <ToastHost />
      <SnackHost />
    </div>
  );
}
