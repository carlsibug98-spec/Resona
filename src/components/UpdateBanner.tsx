"use client";

import { useState } from "react";
import { updateBridge, useDesktopUpdateStatus } from "@/lib/useDesktopUpdate";

/**
 * Update banner for the desktop shell — the visible half of the v1.7.10
 * update policy (the startup path never downloads and never quits).
 *
 * While the background updater streams the new installer the banner shows
 * honest progress; once the installer is on disk it flips to
 * "Restart to apply": Restart hands control to the main process, which
 * quits the app cleanly, lets the installer replace the files and
 * relaunches straight into the new version. "Later" dismisses the ready
 * banner for this version (the quit path still applies it silently as a
 * last resort, and Settings → Updates keeps a live Restart button).
 *
 * Web-only builds have no resonaDesktop bridge, so the banner renders
 * nothing there.
 */
export function UpdateBanner() {
  const status = useDesktopUpdateStatus();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  if (!status) return null;

  if (status.state === "downloading") {
    return (
      <div className="updban" role="status">
        <b>Updating Resona</b>
        <span className="trunc">Downloading update… {status.percent ?? 0}%</span>
      </div>
    );
  }

  if (status.state !== "ready") return null;

  const version = status.version || "a new version";
  if (dismissedVersion === version) return null;

  return (
    <div className="updban" role="status">
      <b>Resona {version} is ready</b>
      <span className="trunc">Restart to apply the update.</span>
      <span className="grp">
        <button
          className="pri"
          onClick={() => {
            updateBridge()?.installUpdate?.();
          }}
        >
          Restart now
        </button>
        <button onClick={() => setDismissedVersion(version)}>Later</button>
      </span>
    </div>
  );
}
