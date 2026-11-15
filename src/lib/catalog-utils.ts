/**
 * Pure helpers for the global home shelves — kept free of imports so the
 * node test runner can load them directly.
 */

/** stable hue from a name — replaces the mockup's hand-picked per-item hues */
export function hueFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 100000;
  return h % 360;
}

/** chart rows that are clearly not music releases (trailers, playlists…) */
const JUNK = /trailer|announcement|playlist|reaction|interview|podcast|full album|compilation|top \d+ .*(songs|hits)|best of/i;

/** is this chart entry a music release? */
export function isMusicEntry(title: string, artist: string): boolean {
  return !JUNK.test(title) && artist !== "Unknown artist";
}
