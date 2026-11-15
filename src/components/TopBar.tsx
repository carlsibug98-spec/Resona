"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useUi } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { useUpdateAvailable } from "@/lib/useUpdate";
import { Icon } from "@/components/Icon";
import { exportLibrary } from "@/lib/backup";

/**
 * Mockup top bar: back / forward, brand (mobile only), import pill and
 * the avatar account menu with the backup nudge.
 */
export function TopBar() {
  const ui = useUi();
  const canBack = ui.canBack();
  const canForward = ui.canForward();
  const { resolvedTheme, setTheme } = useTheme();
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const hasData = useLibrary(
    (s) => Object.keys(s.liked).length + s.playlists.length + s.history.length > 0
  );
  const update = useUpdateAvailable();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen]);

  const isDark = resolvedTheme !== "light";
  const needsBackup = hasData && !lastBackupAt;

  return (
    <div className="top">
      <button
        className="iconbtn"
        style={{ opacity: canBack ? 1 : 0.35 }}
        onClick={() => ui.back()}
        aria-label="Back"
        title="Back"
      >
        <Icon name="back" />
      </button>
      <button
        className="iconbtn dim"
        style={{ opacity: canForward ? 1 : 0.35, cursor: canForward ? "pointer" : "default" }}
        onClick={() => canForward && ui.forward()}
        aria-label="Forward"
        title="Forward"
      >
        <Icon name="fwd" />
      </button>
      <span className="brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#resona-g)" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <defs>
            <linearGradient id="resona-g" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#7c5cff" />
              <stop offset="1" stopColor="#5eead4" />
            </linearGradient>
          </defs>
          <path d="M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4" />
        </svg>
        Resona
      </span>
      <div className="sp" />
      <button className="pill" onClick={() => ui.openModal({ kind: "import" })}>
        <Icon name="queue" className="xs" />
        <span className="hide-sm">Import playlist</span>
      </button>
      <div className="menu-wrap" ref={wrapRef}>
        <button
          className="avatar"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          R
        </button>
        <div className={`menu${menuOpen ? " open" : ""}`} role="menu">
          <div className="who">
            <b>Resona listener</b>
            <span className="sub">Stored on this device</span>
          </div>
          <button className="mi" role="menuitem" onClick={() => { setMenuOpen(false); ui.navigate({ name: "settings" }); }}>
            <Icon name="gear" /> Settings
          </button>
          <button className="mi" role="menuitem" onClick={() => { setMenuOpen(false); ui.navigate({ name: "settings" }); }}>
            <Icon name="download" /> Backup &amp; restore
          </button>
          <button
            className="mi"
            role="menuitem"
            onClick={() => { setTheme(isDark ? "light" : "dark"); setMenuOpen(false); }}
          >
            <Icon name="moon" /> Toggle light / dark
          </button>
          {update?.hasUpdate && (
            <button
              className="mi"
              role="menuitem"
              onClick={() => { setMenuOpen(false); ui.navigate({ name: "settings" }); }}
            >
              <Icon name="expand" /> Update available — {update.latest}
            </button>
          )}
          {needsBackup && (
            <div className="nudge" id="nudge">
              <b>Your library isn&apos;t backed up yet.</b>
              <br />
              Export it once so a new phone won&apos;t start empty.
              <div>
                <button onClick={() => { exportLibrary(); setMenuOpen(false); }}>Export now</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
