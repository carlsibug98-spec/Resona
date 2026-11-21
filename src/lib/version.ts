/**
 * App version helpers — isomorphic, no imports, safe to unit-test.
 * APP_VERSION is the single source of truth for /api/version; keep it in
 * sync with package.json and desktop/package.json when cutting a release.
 */
export const APP_VERSION = "1.7.13";

export const RELEASES_URL = "https://github.com/carlsibug98-spec/Resona/releases";

/** strips a leading "v" and trims — "v1.3.0 " → "1.3.0" */
export function normalizeVersion(v: string | null | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^v/i, "");
}

/**
 * True when `candidate` is strictly newer than `current` on a
 * major.minor.patch basis. Non-numeric suffixes (1.3.0-beta.1) are compared
 * only by their numeric prefix, and a missing part counts as 0.
 */
export function isNewerVersion(current: string, candidate: string): boolean {
  const cur = parseNumbers(normalizeVersion(current));
  const cand = parseNumbers(normalizeVersion(candidate));
  if (!cand) return false;
  if (!cur) return true;
  for (let i = 0; i < 3; i++) {
    if ((cand[i] ?? 0) !== (cur[i] ?? 0)) return (cand[i] ?? 0) > (cur[i] ?? 0);
  }
  return false;
}

function parseNumbers(v: string): number[] | null {
  const m = v.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, m[3] ? parseInt(m[3], 10) : 0];
}
