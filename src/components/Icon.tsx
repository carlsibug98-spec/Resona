import { cx } from "@/lib/format";

export type IconName =
  | "home"
  | "search"
  | "library"
  | "plus"
  | "back"
  | "fwd"
  | "heart"
  | "play"
  | "pause"
  | "next"
  | "prev"
  | "shuffle"
  | "repeat"
  | "download"
  | "check"
  | "more"
  | "queue"
  | "mic"
  | "gear"
  | "moon"
  | "chev-down"
  | "chev-left"
  | "chev-right"
  | "clock"
  | "x"
  | "link"
  | "video"
  | "people"
  | "expand"
  | "bars"
  | "radio"
  | "vol"
  | "vol-low"
  | "vol-x";

/**
 * Mockup icon set — the same 24×24 symbols, drawn through the shared
 * sprite so every icon in the app renders identically to the design.
 */
export function Icon({
  name,
  className,
  fill = false,
}: {
  name: IconName;
  className?: string;
  fill?: boolean;
}) {
  return (
    <svg className={cx("ic", fill && "fill", className)} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/* symbol defs copied 1:1 from the mockup sprite */
const DEFS = `
<symbol id="i-home" viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></symbol>
<symbol id="i-library" viewBox="0 0 24 24"><path d="M4 5v14M9 5v14M14 7l5 12"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-back" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></symbol>
<symbol id="i-fwd" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></symbol>
<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-9.3-9.1C1.6 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.4 3.3 4.3 6.4C19.5 15.4 12 20 12 20z"/></symbol>
<symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/></symbol>
<symbol id="i-pause" viewBox="0 0 24 24"><rect x="6" y="4" width="4.5" height="16" rx="1"/><rect x="13.5" y="4" width="4.5" height="16" rx="1"/></symbol>
<symbol id="i-next" viewBox="0 0 24 24"><path d="M6 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 6 5.5zM19 5v14" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linecap="round"/></symbol>
<symbol id="i-prev" viewBox="0 0 24 24"><path d="M18 5.5v13a1 1 0 0 1-1.5.9l-10-6.5a1 1 0 0 1 0-1.8l10-6.5A1 1 0 0 1 18 5.5zM5 5v14" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linecap="round"/></symbol>
<symbol id="i-shuffle" viewBox="0 0 24 24"><path d="M3 7h3c4.5 0 5.5 10 10 10h5M3 17h3c2.2 0 3.4-2.6 4.6-5M14.4 9.8C15.5 8 16.6 7 18 7h3M18 4l3 3-3 3M18 14l3 3-3 3"/></symbol>
<symbol id="i-repeat" viewBox="0 0 24 24"><path d="M4 12V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 12v3a3 3 0 0 1-3 3H4M7 21l-3-3 3-3"/></symbol>
<symbol id="i-download" viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4 19.5h16"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
<symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></symbol>
<symbol id="i-queue" viewBox="0 0 24 24"><path d="M4 6h11M4 12h11M4 18h7M17 15v6l4-3z"/></symbol>
<symbol id="i-mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></symbol>
<symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></symbol>
<symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></symbol>
<symbol id="i-chev-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
<symbol id="i-chev-left" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></symbol>
<symbol id="i-chev-right" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></symbol>
<symbol id="i-video" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></symbol>
<symbol id="i-people" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></symbol>
<symbol id="i-expand" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></symbol>
<symbol id="i-bars" viewBox="0 0 24 24"><path d="M5 19V11M12 19V5M19 19v-6"/></symbol>
<symbol id="i-radio" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.8"/><path d="M8.6 15.4a5 5 0 0 1 0-6.8M15.4 8.6a5 5 0 0 1 0 6.8M5.9 18.1a8.8 8.8 0 0 1 0-12.2M18.1 5.9a8.8 8.8 0 0 1 0 12.2"/></symbol>
<symbol id="i-vol" viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 8.8a4.6 4.6 0 0 1 0 6.4M18 6.3a8 8 0 0 1 0 11.4"/></symbol>
<symbol id="i-vol-low" viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 8.8a4.6 4.6 0 0 1 0 6.4"/></symbol>
<symbol id="i-vol-x" viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></symbol>
`;

/** mounted once in AppShell — every <use> resolves against it */
export function IconSprite() {
  return (
    <svg width="0" height="0" className="sprite" aria-hidden="true">
      <defs dangerouslySetInnerHTML={{ __html: DEFS }} />
    </svg>
  );
}
