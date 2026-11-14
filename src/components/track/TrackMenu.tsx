"use client";

import { useState } from "react";
import type { Track } from "@/lib/types";
import { useLibrary } from "@/stores/library";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { downloadTrack } from "@/lib/downloads";
import { formatDuration } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { MoreHorizontal, Plus, ListEnd, ListStart, Heart, Download, User, Link2, ListX } from "lucide-react";
import { toast } from "sonner";

export function TrackMenu({
  track,
  queueIndex,
  trigger,
  onRemoveFromList,
}: {
  track: Track;
  queueIndex?: number;
  trigger: React.ReactNode;
  onRemoveFromList?: () => void;
}) {
  const library = useLibrary();
  const player = usePlayer();
  const ui = useUi();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const addTo = (playlistId: string) => {
    const added = library.addToPlaylist(playlistId, track);
    const pl = library.playlists.find((p) => p.id === playlistId);
    toast.success(
      added ? `Added to "${pl?.name}"` : `Already in "${pl?.name}"`
    );
  };

  const doDownload = async () => {
    toast.info("Downloading…");
    const status = await downloadTrack(track);
    if (status === "offline-saved") toast.success("Saved for offline listening");
    else if (status === "stream-only")
      toast.warning(
        "No direct-stream resolver available — saved to Downloads as stream-only"
      );
    else toast.error("Download failed");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => player.enqueue(track, true)}>
            <ListStart /> Play next
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => player.enqueue(track)}>
            <ListEnd /> Add to queue
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => library.toggleLike(track)}>
            <Heart /> {library.isLiked(track.videoId) ? "Remove from liked" : "Like"}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Plus /> Add to playlist
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              {library.playlists.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => addTo(p.id)}>
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                <Plus /> New playlist…
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={doDownload}>
            <Download /> Download
          </DropdownMenuItem>
          {track.artistId && (
            <DropdownMenuItem
              onClick={() => ui.navigate({ name: "artist", id: track.artistId! })}
            >
              <User /> Go to artist
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              navigator.clipboard
                .writeText(`https://www.youtube.com/watch?v=${track.videoId}`)
                .then(() => toast.success("YouTube link copied"));
            }}
          >
            <Link2 /> Copy YouTube link
          </DropdownMenuItem>
          {(onRemoveFromList || queueIndex !== undefined) && <DropdownMenuSeparator />}
          {queueIndex !== undefined && (
            <DropdownMenuItem onClick={() => player.removeFromQueue(queueIndex)}>
              <ListX /> Remove from queue
            </DropdownMenuItem>
          )}
          {onRemoveFromList && (
            <DropdownMenuItem onClick={onRemoveFromList}>
              <ListX /> Remove from this list
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create new playlist</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{track.title}&quot; will be added to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                const id = library.createPlaylist(newName, [track]);
                setCreateOpen(false);
                setNewName("");
                toast.success(`Created playlist and added track`);
                void id;
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!newName.trim()) return;
                library.createPlaylist(newName, [track]);
                setCreateOpen(false);
                setNewName("");
                toast.success("Playlist created");
              }}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
