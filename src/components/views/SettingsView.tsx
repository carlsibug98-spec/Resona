"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/stores/settings";
import { useLibrary } from "@/stores/library";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
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
import { Monitor, Moon, Sun, Github, Info, Server } from "lucide-react";
import { toast } from "sonner";

export function SettingsView() {
  const settings = useSettings();
  const library = useLibrary();
  const { theme, setTheme } = useTheme();
  const [instances, setInstances] = useState(settings.resolverInstances);
  const [regions, setRegions] = useState<string[]>([]);
  const [health, setHealth] = useState<Record<string, string>>({});

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
        <h2 className="text-lg font-semibold">Your data</h2>
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Likes, playlists, history and download metadata live only in this browser
            (localStorage). Audio downloads live in IndexedDB.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const data = {
                  liked: library.liked,
                  playlists: library.playlists,
                  history: library.history,
                  downloads: Object.fromEntries(
                    Object.entries(library.downloads).map(([k, v]) => [
                      k,
                      { track: v.track, complete: v.complete, size: v.size },
                    ])
                  ),
                  exportedFrom: "Resona",
                  exportedAt: new Date().toISOString(),
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "resona-library.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export library JSON
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (
                  window.confirm(
                    "Delete ALL local data (likes, playlists, history, download metadata)?"
                  )
                ) {
                  library.clearAll();
                  toast.success("Local data cleared");
                }
              }}
            >
              Clear all data
            </Button>
          </div>
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
