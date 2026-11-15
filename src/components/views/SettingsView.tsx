"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useSettings } from "@/stores/settings";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { exportLibrary, parseBackup, restoreBackup, type ParsedBackup } from "@/lib/backup";
import type { RestoreMode, Section } from "@/lib/backup-merge";
import { graduate } from "@/lib/onboarding";
import { APP_VERSION, checkForUpdate, RELEASES_URL, type UpdateInfo } from "@/lib/update-check";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";

export function SettingsView() {
  const settings = useSettings();
  const { theme, setTheme } = useTheme();
  const [instances, setInstances] = useState(settings.resolverInstances);
  const [regions, setRegions] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const library = useLibrary();
  const starterOn = settings.starterContent === "seed" && !!settings.starterAppliedAt;
  const hasData =
    Object.keys(library.liked).length + library.playlists.length + library.history.length > 0;

  useEffect(() => {
    fetch("/api/trending?region=Global")
      .then((r) => r.json())
      .then((d) => setRegions(d.regions || []))
      .catch(() => {});
  }, []);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setMode("merge");
      setPending(await parseBackup(file));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't read that file");
    }
  };

  const checkResolvers = async () => {
    toast("Testing resolvers…");
    try {
      const res = await fetch(
        `/api/stream?videoId=JGwWNGJdvx8&resolve=1&instances=${encodeURIComponent(instances.trim())}`
      );
      const data = await res.json();
      if (data.url) toast(`Working: ${data.provider}`, true);
      else
        toast(
          "No resolver returned a stream — playback falls back to the YouTube player, downloads stay disabled."
        );
    } catch {
      toast("Resolver check failed");
    }
  };

  const runUpdateCheck = async () => {
    setChecking(true);
    const info = await checkForUpdate(true);
    setUpdate(info);
    setChecking(false);
    if (info.error) toast("Couldn't check — GitHub is unreachable or rate-limited this IP. Try again later.");
    else toast(info.hasUpdate ? `Update available: ${info.latest}` : "You're on the latest version", info.hasUpdate);
  };

  return (
    <>
      <div className="hero tight">
        <h1>Settings</h1>
      </div>
      <div className="set">
        <div className="sec">
          <h3>Appearance</h3>
          <p>Dark is the default. Auto follows your system.</p>
          <div className="seg">
            {(
              [
                ["dark", "Dark"],
                ["light", "Light"],
                ["system", "Auto"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={theme === k ? "on" : ""} onClick={() => setTheme(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="sec">
          <h3>Trending region</h3>
          <p>Chart shown on home and in Trending.</p>
          <div className="chips" style={{ padding: 0 }}>
            {(regions.length ? regions : ["Global"]).slice(0, 14).map((r) => (
              <button
                key={r}
                className={`chip${settings.region === r ? " on" : ""}`}
                onClick={() => settings.setRegion(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="sec">
          <h3>Playback</h3>
          <p>
            The video button in full-screen now playing plays the song's real
            music video. Turn it off to keep full-screen audio-only.
          </p>
          <div className="seg">
            <button className={!settings.showVideo ? "on" : ""} onClick={() => settings.setShowVideo(false)}>
              Audio only
            </button>
            <button className={settings.showVideo ? "on" : ""} onClick={() => settings.setShowVideo(true)}>
              Show video
            </button>
          </div>
          <div className="status" style={{ marginTop: 14 }}>
            <span>
              <b>Autoplay radio</b>&nbsp;&nbsp;When the queue ends, keep playing similar songs
            </span>
            <span className="grp">
              <button
                className={`btn2 ghost${settings.autoplayRadio ? " on" : ""}`}
                onClick={() => settings.setAutoplayRadio(true)}
              >
                On
              </button>
              <button
                className={`btn2 ghost${!settings.autoplayRadio ? " on" : ""}`}
                onClick={() => settings.setAutoplayRadio(false)}
              >
                Off
              </button>
            </span>
          </div>
        </div>

        <div className="sec">
          <h3>Audio quality</h3>
          <p>
            Preferred quality for streaming and downloads. Actual bitrate depends on the
            resolver serving the stream — Standard always works, High applies when the
            configured resolvers provide higher-bitrate sources.
          </p>
          <div className="seg">
            <button
              className={settings.audioQuality === "standard" ? "on" : ""}
              onClick={() => settings.setAudioQuality("standard")}
            >
              Standard
            </button>
            <button
              className={settings.audioQuality === "high" ? "on" : ""}
              onClick={() => {
                settings.setAudioQuality("high");
                if (!settings.resolverInstances.trim())
                  toast("High quality needs a resolver — add one below for best results");
              }}
            >
              High
            </button>
          </div>
        </div>

        <div className="sec">
          <h3>Direct-stream resolvers</h3>
          <p>
            Piped / Invidious API hosts that provide direct audio URLs for downloads and
            native playback. Without one, Resona plays through the YouTube player and
            downloads are stream-only. One instance per line.
          </p>
          <input
            className="set-input"
            value={instances}
            onChange={(e) => setInstances(e.target.value)}
            placeholder="https://pipedapi.example.com"
            aria-label="Resolver instances"
          />
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <button
              className="btn2"
              onClick={() => {
                settings.setResolverInstances(instances.trim());
                toast("Resolver list saved", true);
              }}
            >
              <Icon name="check" className="xs" /> Save
            </button>
            <button className="btn2 ghost" onClick={() => void checkResolvers()}>
              Test now
            </button>
          </div>
        </div>

        <div className="sec">
          <h3>Backup &amp; restore</h3>
          <p>
            Your library lives on this device. Export a copy so you can restore it on a
            new phone. Downloaded audio stays on this device — download again after restoring.
          </p>
          <div className="status">
            <span>
              <b>Last backed up</b>&nbsp;&nbsp;
              {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : "Never"}
            </span>
            <span className="grp">
              <button className="btn2 ghost" onClick={() => fileRef.current?.click()}>
                <Icon name="queue" className="xs" /> Restore
              </button>
              <button className="btn2" disabled={!hasData} onClick={() => exportLibrary()}>
                <Icon name="download" className="xs" /> Export
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden-file"
                onChange={(e) => void onPickFile(e)}
              />
            </span>
          </div>
          {pending && (
            <div className="status" style={{ marginTop: 10 }}>
              <span>
                <b>Restore</b>&nbsp;&nbsp;{pending.counts.liked} liked · {pending.counts.playlists} playlists ·{" "}
                {pending.counts.history} history
              </span>
              <span className="grp">
                <button
                  className={`btn2 ghost${mode === "replace" ? "" : " on"}`}
                  onClick={() => setMode("merge")}
                >
                  Merge
                </button>
                <button
                  className={`btn2 ghost${mode === "replace" ? " on" : ""}`}
                  onClick={() => setMode("replace")}
                >
                  Replace
                </button>
                <button
                  className="btn2"
                  onClick={() => {
                    restoreBackup(pending, ["liked", "playlists", "history"], mode);
                    graduate();
                    toast(mode === "merge" ? "Backup merged" : "Backup restored", true);
                    setPending(null);
                  }}
                >
                  {mode === "merge" ? "Merge" : "Replace"}
                </button>
              </span>
            </div>
          )}
        </div>

        <div className="sec">
          <h3>Starter content</h3>
          <p>
            First run seeds a few OPM tracks, a “Late night” playlist and some history so the
            home looks alive. Removing it leaves only music you added yourself.
          </p>
          <div className="status">
            <span>{starterOn ? "Starter content is on this device" : "No starter content"}</span>
            <span className="grp">
              <button
                className="btn2 ghost"
                disabled={!starterOn}
                onClick={() => useUi.getState().openModal({ kind: "confirmRemoveStarter" })}
              >
                Remove
              </button>
            </span>
          </div>
        </div>

        <div className="sec">
          <h3>Updates</h3>
          <p>
            Resona checks GitHub for a newer release when it opens. Install the new
            version from the releases page — the app itself stays up to date manually.
          </p>
          <div className="status">
            <span>
              <b>Version</b>&nbsp;&nbsp;{APP_VERSION}
              {update?.hasUpdate && (
                <span style={{ color: "var(--brand2)", fontWeight: 700 }}>
                  &nbsp;&nbsp;· update available: {update.latest}
                </span>
              )}
              {update?.error && <span className="muted">&nbsp;&nbsp;· last check failed</span>}
            </span>
            <span className="grp">
              <button className="btn2 ghost" onClick={() => void runUpdateCheck()} disabled={checking}>
                {checking ? "Checking…" : "Check now"}
              </button>
              {update?.hasUpdate && (
                <a className="btn2" href={update.url || RELEASES_URL} target="_blank" rel="noreferrer">
                  Get update
                </a>
              )}
            </span>
          </div>
        </div>

        <div className="sec">
          <h3>About</h3>
          <p>
            Resona v{APP_VERSION} — a free, open-source music app: search, stream, like,
            playlist, download and import — no account, no ads. Music metadata and playback
            come from YouTube Music; lyrics by LRCLIB; trending by kworb; Spotify import reads
            public playlist embeds. MIT licensed — inspired by OpenSpot
            (BlackHatDevX/openspot-music-app).
          </p>
        </div>
      </div>
    </>
  );
}
