"use client";

import { useState } from "react";
import type { SpotifyImportResult } from "@/lib/types";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ListPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ImportDialog() {
  const ui = useUi();
  const library = useLibrary();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SpotifyImportResult | null>(null);

  const close = () => {
    ui.setImportOpen(false);
    setUrl("");
    setResult(null);
    setProgress(0);
  };

  const run = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setProgress(5);
    const t = setInterval(() => setProgress((p) => Math.min(90, p + 4)), 500);
    try {
      const res = await fetch(
        `/api/import/spotify?url=${encodeURIComponent(url.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      setProgress(100);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Import failed: ${e.message}`
          : "Import failed — is the playlist public?"
      );
    } finally {
      clearInterval(t);
      setLoading(false);
    }
  };

  const saveAsPlaylist = () => {
    if (!result) return;
    const id = library.createPlaylist(result.name || "Imported playlist", result.tracks);
    close();
    ui.navigate({ name: "playlist", id });
    toast.success(
      `Imported ${result.tracks.length}/${result.total} tracks` +
        (result.unmatched.length ? ` · ${result.unmatched.length} unmatched` : "")
    );
  };

  return (
    <Dialog open={ui.importOpen} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="h-5 w-5" /> Import Spotify playlist
          </DialogTitle>
          <DialogDescription>
            Paste a public Spotify playlist URL. Resona reads the track list and
            search-matches every song on the music source.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://open.spotify.com/playlist/…"
              disabled={loading}
              onKeyDown={(e) => e.key === "Enter" && run()}
            />
            <Button onClick={run} disabled={loading || !url.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
            </Button>
          </div>

          {loading && <Progress value={progress} />}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
                {result.cover && (
                  <img src={result.cover} alt="" className="h-12 w-12 rounded object-cover" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{result.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {result.tracks.length}/{result.total} tracks matched
                    {result.unmatched.length > 0 &&
                      ` · ${result.unmatched.length} not found`}
                  </div>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border scrollbar-thin">
                {result.tracks.slice(0, 100).map((t) => (
                  <div key={t.videoId} className="flex items-center gap-2 border-b px-3 py-1.5 text-sm last:border-0">
                    <img src={t.thumb} alt="" className="h-7 w-7 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="max-w-32 truncate text-xs text-muted-foreground">
                      {t.artist}
                    </span>
                  </div>
                ))}
                {result.unmatched.map((u, i) => (
                  <div
                    key={`u-${i}`}
                    className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate">✕ {u.title}</span>
                    <span className="max-w-32 truncate text-xs">{u.artist}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full rounded-full"
                onClick={saveAsPlaylist}
                disabled={!result.tracks.length}
              >
                Save {result.tracks.length} tracks as playlist
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
