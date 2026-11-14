"use client";

import { useState } from "react";
import { useLibrary } from "@/stores/library";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { TrackRow } from "@/components/track/TrackRow";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { removeDownload, startDownload } from "@/components/track/DownloadButton";
import type { DownloadEntry } from "@/stores/library";
import { formatBytes, formatDuration } from "@/lib/format";
import { useTrackDuration } from "@/stores/durations";
import {
  Download,
  Heart,
  History,
  ListMusic,
  Play,
  Plus,
  Trash2,
  ListPlus,
  Clock,
} from "lucide-react";
import type { Track } from "@/lib/types";

export function LibraryView({ tab }: { tab?: "liked" | "playlists" | "history" | "downloads" }) {
  const library = useLibrary();
  const ui = useUi();
  const [newName, setNewName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const likedTracks = Object.values(library.liked)
    .sort((a, b) => b.likedAt - a.likedAt)
    .map((l) => l.track);

  const startLiked = () => {
    if (likedTracks.length) usePlayer.getState().playQueue(likedTracks, 0, "Liked songs");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Library</h1>

      <Tabs defaultValue={tab || "liked"}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="liked" className="gap-1.5">
            <Heart className="h-4 w-4" /> Liked
          </TabsTrigger>
          <TabsTrigger value="playlists" className="gap-1.5">
            <ListMusic className="h-4 w-4" /> Playlists
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" /> History
          </TabsTrigger>
          <TabsTrigger value="downloads" className="gap-1.5">
            <Download className="h-4 w-4" /> Downloads
          </TabsTrigger>
        </TabsList>

        {/* LIKED */}
        <TabsContent value="liked" className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button className="rounded-full" onClick={startLiked} disabled={!likedTracks.length}>
              <Play className="h-4 w-4 fill-current" /> Play all
            </Button>
            <span className="text-sm text-muted-foreground">
              {likedTracks.length} liked {likedTracks.length === 1 ? "track" : "tracks"}
            </span>
          </div>
          {likedTracks.length === 0 ? (
            <EmptyState
              icon={<Heart className="h-8 w-8 opacity-40" />}
              title="No liked songs yet"
              text="Tap the heart on any track to build your collection."
              action={{ label: "Find songs", onClick: () => ui.navigate({ name: "search" }) }}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
              {likedTracks.map((t, i) => (
                <TrackRow key={t.videoId} track={t} index={i} showIndex list={likedTracks} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* PLAYLISTS */}
        <TabsContent value="playlists" className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              className="rounded-full"
              onClick={() => {
                const id = library.createPlaylist(`My playlist ${library.playlists.length + 1}`);
                ui.navigate({ name: "playlist", id });
              }}
            >
              <Plus className="h-4 w-4" /> New playlist
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => ui.setImportOpen(true)}>
              <ListPlus className="h-4 w-4" /> Import Spotify playlist
            </Button>
          </div>

          {createOpen && (
            <div className="mb-4 flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Playlist name"
                className="max-w-xs"
                autoFocus
              />
            </div>
          )}

          {library.playlists.length === 0 ? (
            <EmptyState
              icon={<ListMusic className="h-8 w-8 opacity-40" />}
              title="No playlists yet"
              text="Create one, or import a public Spotify playlist by URL."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {library.playlists.map((p) => (
                <button
                  key={p.id}
                  className="group text-left"
                  onClick={() => ui.navigate({ name: "playlist", id: p.id, label: p.name })}
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted shadow">
                    {p.tracks[0] ? (
                      <img src={p.tracks[0].thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ListMusic className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="mt-2 truncate text-sm font-medium group-hover:underline">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.tracks.length} {p.tracks.length === 1 ? "track" : "tracks"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history" className="mt-4">
          {library.history.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-8 w-8 opacity-40" />}
              title="Nothing played yet"
              text="Your recently played tracks will appear here."
              action={{ label: "Find songs", onClick: () => ui.navigate({ name: "search" }) }}
            />
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    usePlayer
                      .getState()
                      .playQueue(
                        library.history.map((h) => h.track),
                        0,
                        "Recently played"
                      );
                  }}
                >
                  <Play className="h-4 w-4 fill-current" /> Play all
                </Button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
                {library.history.map((h, i) => (
                  <TrackRow
                    key={`${h.track.videoId}-${i}`}
                    track={h.track}
                    index={i}
                    showIndex
                    list={library.history.map((x) => x.track)}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* DOWNLOADS */}
        <TabsContent value="downloads" className="mt-4">
          <DownloadsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DownloadsTab() {
  const library = useLibrary();
  const player = usePlayer();
  const [confirmRemove, setConfirmRemove] = useState<Track | null>(null);
  const entries = Object.values(library.downloads).sort((a, b) => b.downloadedAt - a.downloadedAt);

  const play = (t: Track) => player.playQueue([t], 0, "Downloads");

  return (
    <div>
      <div className="mb-4 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        Downloaded audio is stored in this browser (IndexedDB) and plays without a
        connection. The app keeps its own downloader up to date automatically — if a
        download fails, just retry later. Entries marked <em>stream-only</em> are
        leftovers with no saved audio.
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<Download className="h-8 w-8 opacity-40" />}
          title="No downloads"
          text="Use the download icon on any track, or pick Download in its ⋯ menu."
          action={{ label: "Find songs", onClick: () => useUi.getState().navigate({ name: "search" }) }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
          {entries.map((e, i) => (
            <DownloadRow key={e.track.videoId} entry={e} index={i} onPlay={play} onRemove={() => setConfirmRemove(e.track)} />
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the offline copy?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove && `“${confirmRemove.title}” will be deleted from this device. You can download it again any time.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmRemove) void removeDownload(confirmRemove);
                setConfirmRemove(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DownloadRow({
  entry: e,
  index: i,
  onPlay,
  onRemove,
}: {
  entry: DownloadEntry;
  index: number;
  onPlay: (t: Track) => void;
  onRemove: () => void;
}) {
  const duration = useTrackDuration(e.track);
  return (
    <div
      className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/70"
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => onPlay(e.track)}
      >
        <span className="w-6 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
        <img src={e.track.thumb} alt="" className="h-10 w-10 rounded object-cover" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{e.track.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {e.track.artist} ·{" "}
            {e.complete
              ? `${formatBytes(e.size)} offline`
              : "stream-only"}
            {e.complete ? ` · ${formatDuration(duration)}` : ""}
          </span>
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        aria-label="Remove download"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {!e.complete && (
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => void startDownload(e.track)}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-12 text-center">
      <div className="flex justify-center">{icon}</div>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      {action && (
        <Button className="mt-5 rounded-full" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
