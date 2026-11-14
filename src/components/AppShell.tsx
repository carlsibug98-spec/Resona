"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { useUi, type View } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { useLibrary } from "@/stores/library";
import { HomeView } from "@/components/views/HomeView";
import { SearchView } from "@/components/views/SearchView";
import { ArtistView } from "@/components/views/ArtistView";
import { AlbumView } from "@/components/views/AlbumView";
import { PlaylistView } from "@/components/views/PlaylistView";
import { LibraryView } from "@/components/views/LibraryView";
import { SettingsView } from "@/components/views/SettingsView";
import { PlayerBar } from "@/components/player/PlayerBar";
import { FullPlayer } from "@/components/player/FullPlayer";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { ImportDialog } from "@/components/ImportDialog";
import { cx, monoGradient } from "@/lib/format";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Home,
  Library,
  ListPlus,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    case "settings":
      return <SettingsView />;
    default:
      return <HomeView />;
  }
}

/** signature moment: pages leave and enter through a soft blur-rise */
const pageMotion = {
  initial: { opacity: 0, y: 16, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -12, filter: "blur(8px)" },
  transition: { duration: 0.32, ease: [0.22, 0.9, 0.28, 1] as const },
};

type LibChip = "all" | "playlists" | "liked" | "downloads";

export function AppShell() {
  const ui = useUi();
  const view = ui.views[ui.views.length - 1];
  const hasTrack = usePlayer((s) => s.queue.length > 0);
  const likedCount = useLibrary((s) => Object.keys(s.liked).length);
  const plCount = useLibrary((s) => s.playlists.length);
  const playlists = useLibrary((s) => s.playlists);
  const downloads = useLibrary((s) => s.downloads);
  const [chip, setChip] = useState<LibChip>("all");

  // browser back button support
  useEffect(() => {
    const onPop = () => ui.back();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [ui]);

  useEffect(() => {
    window.history.pushState({ resona: true }, "");
  }, [ui.views.length]);

  const navItems = [
    { view: { name: "home" } as View, label: "Home", icon: Home },
    { view: { name: "search" } as View, label: "Search", icon: Search },
    { view: { name: "library", tab: "liked" } as View, label: "Library", icon: Library },
    { view: { name: "settings" } as View, label: "Settings", icon: Settings },
  ];

  const viewKey = view.name + ("id" in view ? `:${view.id}` : "");
  const dlList = Object.values(downloads);
  const showLiked = chip === "all" || chip === "liked" || chip === "playlists";
  const showPlaylists = chip === "all" || chip === "playlists";
  const showDownloads = (chip === "all" || chip === "downloads") && dlList.length > 0;

  const content = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={viewKey} {...pageMotion}>
        <MainView view={view} />
      </motion.div>
    </AnimatePresence>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "flex min-h-screen flex-col bg-background text-foreground md:h-screen md:overflow-hidden",
          hasTrack && "md:pb-[72px]"
        )}
      >
        <PlayerProvider />

        {/* mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/90 px-3 backdrop-blur-xl md:hidden">
          {ui.canBack() ? (
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent"
              onClick={() => ui.back()}
              aria-label="Back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 10v4" /><path d="M8 6v12" /><path d="M12 3v18" /><path d="M16 6v12" /><path d="M20 10v4" />
              </svg>
            </span>
          )}
          <span className="text-lg font-bold tracking-tight">Resona</span>
          <button
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent"
            onClick={() => ui.navigate({ name: "search" })}
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
        </header>

        {/* ── body: Spotify-style nav card + library card + main panel ── */}
        <div className="flex min-h-0 flex-1 gap-2 px-0 md:px-2 md:pt-2">
          {/* desktop sidebar */}
          <aside className="hidden w-[280px] shrink-0 flex-col gap-2 md:flex">
            <nav className="shrink-0 rounded-lg bg-card p-2" aria-label="Main">
              <button
                className={cn(
                  "flex h-12 w-full items-center gap-4 rounded-md px-3 text-sm font-bold transition-colors",
                  view.name === "home"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => ui.navigate({ name: "home" })}
              >
                <Home className="h-6 w-6" /> Home
              </button>
              <button
                className={cn(
                  "flex h-12 w-full items-center gap-4 rounded-md px-3 text-sm font-bold transition-colors",
                  view.name === "search"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => ui.navigate({ name: "search" })}
              >
                <Search className="h-6 w-6" /> Search
              </button>
            </nav>
            <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-card p-2">
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <button
                className="flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => ui.navigate({ name: "library", tab: "playlists" })}
              >
                <Library className="h-4 w-4" /> Your Library
                <span className="text-xs font-medium tabular-nums text-muted-foreground/70">
                  {plCount + 1}
                </span>
              </button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-90"
                onClick={() => ui.setImportOpen(true)}
                aria-label="Import playlist"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {([
                ["all", "All"],
                ["playlists", "Playlists"],
                ["liked", "Liked"],
                ["downloads", "Downloads"],
              ] as const).map(([key, label]) =>
                key === "downloads" && dlList.length === 0 ? null : (
                  <button
                    key={key}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      chip === key
                        ? "bg-foreground text-background"
                        : "bg-foreground/10 text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setChip(key)}
                  >
                    {label}
                  </button>
                )
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin">
              {showLiked && (
                <button
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent/60"
                  onClick={() => ui.navigate({ name: "library", tab: "liked" })}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,#450af5,#c4efd9)] text-white shadow-[0_4px_14px_rgba(0,0,0,0.35)]">
                    <Heart className="h-5 w-5 fill-current" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">Liked songs</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Playlist · {likedCount} songs
                    </span>
                  </span>
                </button>
              )}

              {showPlaylists &&
                playlists.map((p) => {
                  const active = view.name === "playlist" && (view as { id?: string }).id === p.id;
                  return (
                    <button
                      key={p.id}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
                        active ? "bg-accent" : "hover:bg-accent/60"
                      )}
                      onClick={() => ui.navigate({ name: "playlist", id: p.id, label: p.name })}
                    >
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-sm font-bold text-foreground/70 shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
                        style={{ background: monoGradient(p.id + p.name) }}
                      >
                        {p.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          Playlist · {p.tracks.length} songs
                        </span>
                      </span>
                    </button>
                  );
                })}

              {showDownloads &&
                dlList.map((d) => (
                  <button
                    key={d.track.videoId}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent/60"
                    onClick={() => usePlayer.getState().playTrack(d.track)}
                  >
                    <img
                      src={d.track.thumb}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{d.track.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Song · {d.track.artist}
                      </span>
                    </span>
                  </button>
                ))}

              {showPlaylists && playlists.length === 0 && likedCount === 0 && (
                <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
                  Nothing here yet. Play something, like it, or import a playlist.
                </p>
              )}
            </div>

            </div>
          </aside>

          {/* canvas panel (desktop) / plain main (mobile) */}
          <main className="min-w-0 flex-1 md:relative md:min-h-0 md:overflow-hidden md:rounded-t-lg md:bg-card">
            {/* desktop topbar overlay — nav arrows + actions over the panel */}
            <div className="absolute inset-x-0 top-0 z-20 hidden h-16 items-center gap-2 bg-gradient-to-b from-accent/70 via-accent/30 to-transparent px-6 md:flex">
              <button
                className={cx(
                  "flex h-8 w-8 items-center justify-center rounded-full bg-black/70 transition-all active:scale-90",
                  ui.canBack() ? "text-foreground hover:bg-black" : "text-muted-foreground/40"
                )}
                onClick={() => ui.back()}
                disabled={!ui.canBack()}
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-muted-foreground/40 transition-all active:scale-90"
                disabled
                aria-label="Forward"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  className="flex h-8 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-bold text-background transition-transform hover:scale-[1.04] active:scale-100"
                  onClick={() => ui.setImportOpen(true)}
                >
                  <ListPlus className="h-4 w-4" /> Import playlist
                </button>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-muted-foreground transition-all hover:bg-black hover:text-foreground active:scale-90"
                  onClick={() => ui.navigate({ name: "settings" })}
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-neutral-500 to-neutral-900 text-xs font-bold text-foreground ring-1 ring-border"
                  aria-label="Profile"
                >
                  R
                </span>
              </div>
            </div>
            <div className="px-4 pb-44 pt-2 md:absolute md:inset-0 md:overflow-y-auto md:px-6 md:pb-32 md:pt-[84px] scrollbar-thin">
              {content}
            </div>
          </main>
        </div>

        {/* mobile bottom nav */}
        <nav
          className={cn(
            "fixed inset-x-0 z-20 border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden",
            hasTrack ? "bottom-[4.5rem]" : "bottom-0"
          )}
        >
          <div className="grid grid-cols-4">
            {navItems.map((item) => {
              const active = view.name === item.view.name;
              return (
                <button
                  key={item.label}
                  className={cn(
                    "relative flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                  onClick={() => ui.navigate(item.view)}
                >
                  <item.icon className={cn("h-5 w-5", active && "scale-110")} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {hasTrack && <PlayerBar />}
        <FullPlayer />
        <ImportDialog />
      </div>
    </MotionConfig>
  );
}
