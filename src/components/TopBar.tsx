"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useUi } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { useUpdateAvailable } from "@/lib/useUpdate";
import { Icon } from "@/components/Icon";
import { exportLibrary } from "@/lib/backup";
import { GS_STEPS, markStep, runGsStep } from "@/lib/onboarding";

/**
 * Mockup v3 top bar: back / forward, brand (mobile only), import pill, the
 * avatar account menu with the backup nudge — plus the onboarding progress
 * ring: the av-pill capsule slides out on hover, and the checklist popover
 * (gsp-pop) lists the six getting-started steps with a progress bar.
 */
export function TopBar() {
  const ui = useUi();
  const canBack = ui.canBack();
  const canForward = ui.canForward();
  const { resolvedTheme, setTheme } = useTheme();
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const doneIds = useSettings((s) => s.onboardingSteps);
  const hasData = useLibrary(
    (s) => Object.keys(s.liked).length + s.playlists.length + s.history.length > 0
  );
  const update = useUpdateAvailable();
  const [menuOpen, setMenuOpen] = useState(false);
  const [gsOpen, setGsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !gsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setGsOpen(false);
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen, gsOpen]);

  const isDark = resolvedTheme !== "light";
  const needsBackup = hasData && !lastBackupAt;

  const n = GS_STEPS.filter((s) => doneIds.includes(s.id)).length;
  const total = GS_STEPS.length;
  const pct = Math.round((n / total) * 100);
  const nextId = GS_STEPS.find((s) => !doneIds.includes(s.id))?.id;

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
        <span className="logo-dot">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 10v4" />
            <path d="M8 6v12" />
            <path d="M12 3v18" />
            <path d="M16 6v12" />
            <path d="M20 10v4" />
          </svg>
        </span>
      </span>
      <div className="sp" />
      <button className="pill" onClick={() => ui.openModal({ kind: "import" })}>
        <Icon name="queue" className="xs" />
        <span className="hide-sm">Import playlist</span>
      </button>
      <div className={`menu-wrap${gsOpen ? " gs-open" : ""}`} ref={wrapRef}>
        <button
          className="av-pill"
          aria-label="Onboarding checklist"
          onClick={() => {
            setGsOpen((o) => !o);
            setMenuOpen(false);
          }}
        >
          <span className="av-ring" style={{ "--p": pct } as React.CSSProperties}>
            <span>
              {n}/{total}
            </span>
          </span>
        </button>
        <div className="ring-av" style={{ "--p": pct } as React.CSSProperties}>
          <button
            className="avatar"
            onClick={() => {
              setMenuOpen((o) => !o);
              setGsOpen(false);
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
            R
          </button>
        </div>
        <div className="av-tip">Onboarding Checklist</div>
        <div className="gsp-pop" role="dialog" aria-label="Onboarding checklist">
          <div className="gsp-head">
            <div className="gsp-title">
              <h3>Onboarding Checklist</h3>
              <p>A few quick steps to get the most out of Resona.</p>
            </div>
            <div className="gsp-ring" style={{ "--p": pct } as React.CSSProperties}>
              <span>
                {n}/{total}
              </span>
            </div>
          </div>
          <div className="gsp-bar">
            <i style={{ "--p": pct } as React.CSSProperties} />
          </div>
          <ul className="gsp-list">
            {GS_STEPS.map((s, i) => {
              const done = doneIds.includes(s.id);
              const next = !done && s.id === nextId;
              return (
                <li key={s.id}>
                  <button
                    className={`gsp-item${done ? " done" : ""}${next ? " next" : ""}`}
                    onClick={() => {
                      runGsStep(s.id);
                      markStep(s.id);
                    }}
                  >
                    {done ? (
                      <span className="gsp-check">
                        <span>
                          <Icon name="check" />
                        </span>
                      </span>
                    ) : (
                      <span className="gsp-icon">
                        <Icon name={s.icon} />
                      </span>
                    )}
                    <span className="gsp-text">
                      <b>
                        {i + 1}. {s.title}
                      </b>
                      <span className="d">{s.text}</span>
                      {next && <span className="gsp-tag">Up next</span>}
                    </span>
                    {!done && <span className="gsp-cta">{s.cta}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="gsp-foot">
            {n === total ? "All done. Nice work." : `${total - n} step${total - n === 1 ? "" : "s"} to go`}
          </div>
        </div>
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
