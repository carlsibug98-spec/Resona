"use client";

import { useState } from "react";
import { useLibrary } from "@/stores/library";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { TrackRow } from "@/components/track/TrackRow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ChevronLeft, MoreVertical, Pencil, Play, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function PlaylistView({ id }: { id: string }) {
  const library = useLibrary();
  const ui = useUi();
  const playlist = library.playlists.find((p) => p.id === id);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(playlist?.name || "");

  if (!playlist)
    return (
      <div className="rounded-xl border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        Playlist not found.{" "}
        <Button variant="link" className="px-1" onClick={() => ui.navigate({ name: "library", tab: "playlists" })}>
          Back to library
        </Button>
      </div>
    );

  const tracks = playlist.tracks;

  const exportJson = () => {
    const data = {
      name: playlist.name,
      exportedFrom: "Resona",
      exportedAt: new Date().toISOString(),
      tracks: tracks.map((t) => ({
        title: t.title,
        artist: t.artist,
        videoId: t.videoId,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlist.name.replace(/[^\w-]+/g, "_")}.resona.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <button
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => ui.back()}
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-2xl bg-muted shadow-lg">
          {tracks[0] ? (
            <img
              src={tracks[0].thumb}
              alt=""
              className="h-full w-full rounded-2xl object-cover"
            />
          ) : (
            <span className="text-3xl font-bold text-muted-foreground/40">♪</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Playlist · {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
          </div>
          <h1 className="mt-1 truncate text-3xl font-bold tracking-tight">{playlist.name}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="rounded-full"
              disabled={!tracks.length}
              onClick={() => usePlayer.getState().playQueue(tracks, 0, playlist.name)}
            >
              <Play className="h-4 w-4 fill-current" /> Play
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={!tracks.length}
              onClick={() => {
                usePlayer.getState().toggleShuffle();
                usePlayer.getState().playQueue(tracks, Math.floor(Math.random() * tracks.length), playlist.name);
              }}
            >
              <Shuffle className="h-4 w-4" /> Shuffle
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full" aria-label="Playlist options">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportJson} disabled={!tracks.length}>
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 /> Delete playlist
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          This playlist is empty. Add songs from search or trending via the ⋯ menu.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
          {tracks.map((t, i) => (
            <TrackRow
              key={t.videoId}
              track={t}
              index={i}
              showIndex
              list={tracks}
              onRemoveFromList={() => {
                library.removeFromPlaylist(playlist.id, t.videoId);
                toast.success("Removed from playlist");
              }}
            />
          ))}
        </div>
      )}

      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename playlist</AlertDialogTitle>
          </AlertDialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (name.trim()) library.renamePlaylist(playlist.id, name.trim());
                setRenameOpen(false);
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{playlist.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Your liked songs and other playlists are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                library.deletePlaylist(playlist.id);
                setDeleteOpen(false);
                ui.navigate({ name: "library", tab: "playlists" });
                toast.success("Playlist deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
