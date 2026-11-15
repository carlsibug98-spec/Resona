"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { useUi } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { useUpdateAvailable } from "@/lib/useUpdate";
import { Icon } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { WindowControls, useIsDesktop } from "@/components/WindowControls";
import { exportLibrary } from "@/lib/backup";
import { GS_STEPS, runGsStep } from "@/lib/onboarding";

/**
 * App header, Spotify-style: one row across the whole window, above the
 * sidebar, the main column and the queue. History arrows, home, the search
 * bar, the import pill, the account menu and the onboarding ring live here,
 * and on desktop the empty parts of the row drag the window.
 *
 * The checklist popover is portalled to <body>. Inside the header it was
 * clipped by the scrolling main column.
 */
export function TopBar() {
  const ui = useUi();
  const canBack = ui.canBack();
  const canForward = ui.canForward();
  const view = ui.view();
  const onHome = view.name === "home";
  const { resolvedTheme, setTheme } = useTheme();
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const doneIds = useSettings((s) => s.onboardingSteps);
  const hasData = useLibrary(
    (s) => Object.keys(s.liked).length + s.playlists.length + s.history.length > 0
  );
  const update = useUpdateAvailable();
  const desktop = useIsDesktop();
  const [menuOpen, setMenuOpen] = useState(false);
  const [gsOpen, setGsOpen] = useState(false);
  const [popPos, setPopPos] = useState({ top: 0, right: 12 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const n = GS_STEPS.filter((s) => doneIds.includes(s.id)).length;
  const total = GS_STEPS.length;
  const pct = Math.round((n / total) * 100);
  const allDone = n === total;
  const nextId = GS_STEPS.find((s) => !doneIds.includes(s.id))?.id;
  const isDark = resolvedTheme !== "light";
  const needsBackup = hasData && !lastBackupAt;

  // the account menu and the checklist close on any click outside them
  useEffect(() => {
    if (!menuOpen && !gsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setMenuOpen(false);
      setGsOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen, gsOpen]);

  // the portalled checklist sits under the avatar and follows it on resize
  useLayoutEffect(() => {
    if (!gsOpen) return;
    const place = () => {
      const r = avatarRef.current?.getBoundingClientRect();
      if (!r) return;
      // on phones the panel is nearly full width, so pin it to the screen's right margin
      const right = window.innerWidth <= 820 ? 8 : Math.max(8, window.innerWidth - r.right);
      setPopPos({ top: r.bottom + 10, right });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [gsOpen]);

  return (
    <header className={`top${desktop ? " desktop" : ""}`}>
      <div className="top-nav">
        <button
          className="iconbtn"
          style={{ opacity: canBack ? 1 : 0.35 }}
          onClick={() => ui.back()}
          aria-label="Back"
          data-tip="Back"
        >
          <Icon name="back" />
        </button>
        <button
          className="iconbtn"
          style={{ opacity: canForward ? 1 : 0.35, cursor: canForward ? "pointer" : "default" }}
          onClick={() => canForward && ui.forward()}
          aria-label="Forward"
          data-tip="Forward"
        >
          <Icon name="fwd" />
        </button>
        {/* nav-relocation ①: the home button becomes a green pill while Home is active */}
        <button
          className={`iconbtn homebtn${onHome ? " on" : ""}`}
          onClick={() => ui.navigate({ name: "home" })}
          aria-label="Home"
          data-tip="Home"
        >
          <Icon name="home" />
        </button>
      </div>

      <span className="brand" aria-hidden="true">
        <LogoMark size={24} />
      </span>

      <button className="topsearch" onClick={() => ui.navigate({ name: "search" })} aria-label="Search">
        <Icon name="search" />
        <span>What do you want to play?</span>
      </button>

      <div className="top-right">
        <button className="pill" onClick={() => ui.openModal({ kind: "import" })}>
          <Icon name="queue" className="xs" />
          {/* button-placement fix (mockup 3): the long pill crowded the window
              controls at narrow widths — shortened to "Import" */}
          <span className="hide-sm">Import</span>
        </button>

        <div className={`menu-wrap${gsOpen ? " gs-open" : ""}`} ref={wrapRef}>
          {!allDone && (
            <button
              className="av-pill"
              aria-label="Onboarding checklist"
              onClick={() => {
                setGsOpen((o) => !o);
                setMenuOpen(false);
              }}
            >
              <span className="av-ring" style={{ "--p": pct } as CSSProperties}>
                <span>
                  {n}/{total}
                </span>
              </span>
            </button>
          )}
          <div
            className={`ring-av${allDone ? " plain" : ""}`}
            ref={avatarRef}
            style={{ "--p": pct } as CSSProperties}
          >
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
          {!allDone && <div className="av-tip">Onboarding Checklist</div>}

          <div className={`menu${menuOpen ? " open" : ""}`} role="menu">
            <div className="who">
              <b>Resona listener</b>
              <span className="sub">Stored on this device</span>
            </div>
            {/* nav-relocation ④: with the sidebar nav card gone, Settings and
                Trending are reached from this profile menu (Trending also
                stays reachable from the home shelf) */}
            <button className="mi" role="menuitem" onClick={() => { setMenuOpen(false); ui.navigate({ name: "trending" }); }}>
              <Icon name="bars" /> Trending
            </button>
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
              <button className="mi" role="menuitem" onClick={() => { setMenuOpen(false); ui.navigate({ name: "settings" }); }}>
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

      <WindowControls />

      {gsOpen &&
        !allDone &&
        createPortal(
          <div
            ref={popRef}
            className="gsp-pop"
            role="dialog"
            aria-label="Onboarding checklist"
            style={{ top: popPos.top, right: popPos.right }}
          >
            <div className="gsp-head">
              <div className="gsp-title">
                <h3>Onboarding Checklist</h3>
                <p>A few quick steps to get the most out of Resona.</p>
              </div>
              <div className="gsp-ring" style={{ "--p": pct } as CSSProperties}>
                <span>
                  {n}/{total}
                </span>
              </div>
            </div>
            <div className="gsp-bar">
              <i style={{ "--p": pct } as CSSProperties} />
            </div>
            <ul className="gsp-list">
              {GS_STEPS.map((s, i) => {
                const done = doneIds.includes(s.id);
                const next = !done && s.id === nextId;
                return (
                  <li key={s.id}>
                    {/* opens the feature only; the feature itself marks the step done */}
                    <button
                      className={`gsp-item${done ? " done" : ""}${next ? " next" : ""}`}
                      onClick={() => {
                        setGsOpen(false);
                        runGsStep(s.id);
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
            <div className="gsp-foot">{`${total - n} step${total - n === 1 ? "" : "s"} to go`}</div>
          </div>,
          document.body
        )}
    </header>
  );
}
