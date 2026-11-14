"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/stores/settings";
import { useLibrary } from "@/stores/library";
import { exportLibrary, parseBackup, restoreBackup, type ParsedBackup } from "@/lib/backup";
import type { RestoreMode, Section } from "@/lib/backup-merge";
import { deleteDownloadedAudio } from "@/lib/downloads";
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
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Github, Info, Monitor, Moon, Server, Sun, Upload } from "lucide-react";
import { toast } from "sonner";
import { APP_VERSION, RELEASES_URL } from "@/lib/version";

interface VersionInfo {
  version: string;
  latest: { version: string; url: string; publishedAt: string | null } | null;
  updateAvailable: boolean;
}

export function SettingsView() {
  const settings = useSettings();
  const library = useLibrary();
  const { theme, setTheme } = useTheme();
  const [instances, setInstances] = useState(settings.resolverInstances);
  const [regions, setRegions] = useState<string[]>([]);
  const [health, setHealth] = useState<Record<string, string>>({});
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [sections, setSections] = useState<Section[]>(["liked", "playlists", "history"]);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [clearOpen, setClearOpen] = useState(false);
  const hasData = useLibrary(
    (s) => Object.keys(s.liked).length + s.playlists.length + s.history.length > 0
  );
  const lastBackupAt = useSettings((s) => s.lastBackupAt);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again later
    if (!file) return;
    try {
      setSections(["liked", "playlists", "history"]);
      setMode("merge");
      setPending(await parseBackup(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that file");
    }
  };

  const clearEverything = async () => {
    // remove the audio blobs too, otherwise they stay orphaned in IndexedDB
    await Promise.all(
      Object.keys(library.downloads).map((id) => deleteDownloadedAudio(id).catch(() => {}))
    );
    library.clearAll();
    toast.success("All local data cleared");
  };

  const checkForUpdate = async (quiet = false) => {
    setCheckingUpdate(true);
    try {
      const r = await fetch("/api/version?fresh=1", { cache: "no-store" });
      const v = (await r.json()) as VersionInfo;
      setVersionInfo(v);
      if (!quiet) {
        if (v.updateAvailable) toast.info(`Resona ${v.latest?.version} is available`);
        else toast.success("You're on the latest version");
      }
    } catch {
      if (!quiet) toast.error("Couldn't reach GitHub to check for updates");
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    fetch("/api/version")
      .then((r) => r.json())
      .then((v) => setVersionInfo(v as VersionInfo))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/trending?region=Global")
      .then((r) => r.json())
      .then((d) => setRegions(d.regions || []))
      .catch(() => {});
  }, []);

  const checkResolvers = async () => {
    toast.info("Testing resolvers…");
    try {
      const res = await fetch(
        `/api/stream?videoId=JGwWNGJdvx8&resolve=1&instances=${encodeURIComponent(instances.trim())}`
      );
      const data = await res.json();
      if (data.url) toast.success(`Working: ${data.provider}`);
      else
        toast.warning(
          "No resolver returned a stream — playback falls back to the YouTube player, downloads stay disabled."
        );
    } catch {
      toast.error("Resolver check failed");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <div className="rounded-xl border p-4">
          <Label className="text-sm text-muted-foreground">Theme</Label>
          <div className="mt-2 flex gap-2">
            {(
              [
                ["light", Sun, "Light"],
                ["dark", Moon, "Dark"],
                ["system", Monitor, "Auto"],
              ] as const
            ).map(([value, Icon, label]) => (
              <Button
                key={value}
                variant={theme === value ? "default" : "outline"}
                className="flex-1 rounded-xl"
                onClick={() => setTheme(value)}
              >
                <Icon className="h-4 w-4" /> {label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Trending region</h2>
        <div className="rounded-xl border p-4">
          <Label className="text-sm text-muted-foreground">
            Default region for the trending chart
          </Label>
          <Select value={settings.region} onValueChange={(v) => settings.setRegion(v)}>
            <SelectTrigger className="mt-2 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {(regions.length ? regions : ["Global"]).map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Direct-stream resolvers</h2>
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Resolvers (Piped / Invidious API hosts) provide direct audio URLs used for
            offline downloads and gapless native playback. Without one, Resona plays via
            the embedded YouTube player and downloads are stream-only. One instance per
            line.
          </p>
          <Input
            value={instances}
            onChange={(e) => setInstances(e.target.value)}
            placeholder="https://pipedapi.example.com"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => {
                settings.setResolverInstances(instances.trim());
                toast.success("Resolver list saved");
              }}
            >
              <Server className="h-4 w-4" /> Save
            </Button>
            <Button variant="outline" onClick={checkResolvers}>
              Test now
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Backup &amp; restore</h2>
        <div className="space-y-4 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            Likes, playlists and history live only in this browser. Export a backup file to keep
            them safe or move them to a new device. Downloaded audio isn&apos;t included, so download
            again after restoring.
          </p>
          <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
            Last backed up:{" "}
            <span className="font-semibold">
              {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : "never"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exportLibrary()} disabled={!hasData}>
              <Download className="h-4 w-4" /> Export backup
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Restore from file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onPickFile}
            />
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={!hasData}
              onClick={() => setClearOpen(true)}
            >
              Clear all data
            </Button>
          </div>
        </div>
      </section>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from backup</AlertDialogTitle>
            <AlertDialogDescription>
              Choose what to restore from this file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending && (
            <div className="space-y-4 text-sm">
              <div className="space-y-2">
                {(
                  [
                    ["liked", "Liked songs", pending.counts.liked],
                    ["playlists", "Playlists", pending.counts.playlists],
                    ["history", "History", pending.counts.history],
                  ] as const
                ).map(([key, label, count]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2"
                  >
                    <Checkbox
                      checked={sections.includes(key)}
                      onCheckedChange={(v) =>
                        setSections((prev) =>
                          v === true
                            ? [...prev.filter((x) => x !== key), key]
                            : prev.filter((x) => x !== key)
                        )
                      }
                    />
                    <span className="flex-1">{label}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={mode === "merge" ? "default" : "outline"}
                  onClick={() => setMode("merge")}
                >
                  Merge
                </Button>
                <Button
                  size="sm"
                  variant={mode === "replace" ? "default" : "outline"}
                  onClick={() => setMode("replace")}
                >
                  Replace
                </Button>
              </div>
              <p className="text-muted-foreground">
                {mode === "merge"
                  ? "Adds what's in the file. Nothing on this device is removed."
                  : "Replaces this device's data in the selected sections with the file's contents. Anything not in the file is lost."}
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sections.length === 0}
              onClick={() => {
                if (!pending) return;
                restoreBackup(pending, sections, mode);
                toast.success(mode === "merge" ? "Backup merged" : "Backup restored");
                setPending(null);
              }}
            >
              {mode === "merge" ? "Merge" : "Replace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes likes, playlists, history and downloaded audio on this device. Export a
              backup first if you might want them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void clearEverything()}
            >
              Clear everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Updates</h2>
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-sm text-muted-foreground">
            The desktop app updates itself automatically from GitHub releases —
            it downloads the new version in the background and installs it on
            restart. On the web app, check manually below.
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-lg bg-muted/40 px-3 py-1.5">
              Installed: <span className="font-semibold">v{APP_VERSION}</span>
            </span>
            {versionInfo?.latest && (
              <span className="rounded-lg bg-muted/40 px-3 py-1.5">
                Latest: <span className="font-semibold">v{versionInfo.latest.version}</span>
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={checkingUpdate}
              onClick={() => void checkForUpdate()}
            >
              <Download className="h-4 w-4" />
              {checkingUpdate ? "Checking…" : "Check for updates"}
            </Button>
            {versionInfo?.updateAvailable && versionInfo.latest && (
              <Button size="sm" onClick={() => window.open(versionInfo.latest!.url)}>
                Get v{versionInfo.latest.version}
              </Button>
            )}
          </div>
          {versionInfo?.updateAvailable && (
            <p className="text-sm text-emerald-400">
              A new version is available. Desktop users get it automatically —
              everyone else can download it from the{" "}
              <a className="underline" href={RELEASES_URL} target="_blank" rel="noreferrer">
                releases page
              </a>
              .
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">About Resona</h2>
        <div className="rounded-xl border p-4 space-y-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Info className="h-4 w-4" /> Resona v1.0 — an independent, open-source
            reimplementation of the OpenSpot music app concept. Original code, same
            system: search, stream, like, playlist, download, import, trend.
          </p>
          <p>
            Music is sourced from YouTube (search metadata via YouTube Music, playback
            via the official embedded player). Lyrics by LRCLIB. Trending data by kworb.
            Spotify import reads public playlist embeds.
          </p>
          <p className="flex items-center gap-2">
            <Github className="h-4 w-4" /> MIT licensed. Credit and inspiration:
            BlackHatDevX/openspot-music-app.
          </p>
        </div>
      </section>
    </div>
  );
}
