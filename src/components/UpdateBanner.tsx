"use client";

import { useEffect, useState } from "react";

/**
 * "Restart to apply" banner for a downloaded update.
 *
 * The desktop main process downloads updates in the background and pushes
 * { version } over IPC (update:ready) once the installer is on disk. Until
 * v1.7.9 that download silently installed on the next quit with no relaunch,
 * which read as "the app never receives the update". Now the banner makes
 * the pending update actionable: Restart hands control back to the main
 * process, which quits the app cleanly, lets the installer replace the
 * files and relaunches straight into the new version.
 *
 * Web-only builds never hear update:ready (no resonaDesktop bridge), so the
 * banner renders nothing there.
 */
interface ResonaUpdateBridge {
  onUpdateReady?: (cb: (info: { version?: string | null }) => void) => () => void;
  installUpdate?: () => void;
}

export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const bridge = (window as unknown as { resonaDesktop?: ResonaUpdateBridge })
      .resonaDesktop;
    if (!bridge?.onUpdateReady) return;
    const off = bridge.onUpdateReady((info) => {
      if (info?.version) setVersion(info.version);
      else setVersion("a new version");
    });
    return () => {
      try {
        off();
      } catch {
        /* bridge gone while quitting */
      }
    };
  }, []);

  if (!version || dismissed) return null;

  return (
    <div className="updban" role="status">
      <b>Resona {version} is ready</b>
      <span className="trunc">Restart to apply the update.</span>
      <span className="grp">
        <button
          className="pri"
          onClick={() => {
            const bridge = (window as unknown as { resonaDesktop?: ResonaUpdateBridge })
              .resonaDesktop;
            bridge?.installUpdate?.();
          }}
        >
          Restart now
        </button>
        <button onClick={() => setDismissed(true)}>Later</button>
      </span>
    </div>
  );
}
