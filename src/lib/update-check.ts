"use client";

import pkg from "@/../package.json";

export const APP_VERSION: string = pkg.version;
export const REPO_OWNER = "carlsibug98-spec";
export const REPO_NAME = "Resona";
export const RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

export interface UpdateInfo {
  hasUpdate: boolean;
  latest: string | null;
  url: string | null;
  checkedAt: number;
  /** true when GitHub could not be reached or rate-limited the check */
  error?: boolean;
}

function parse(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(/[-+]/)[0]
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Reads the latest GitHub release and compares it to the running version.
 * Results are cached in localStorage for an hour so opening the app does
 * not hammer the GitHub API.
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo> {
  const CACHE_KEY = "resona-update-check";
  const now = Date.now();
  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as UpdateInfo;
        if (now - cached.checkedAt < 60 * 60 * 1000) return cached;
      }
    } catch {
      /* ignore cache errors */
    }
  }
  let info: UpdateInfo;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as { tag_name?: string; html_url?: string };
    const latest = d.tag_name || null;
    info = {
      hasUpdate: !!latest && isNewer(latest, APP_VERSION),
      latest,
      url: d.html_url || (latest ? RELEASES_URL : null),
      checkedAt: now,
    };
  } catch {
    info = { hasUpdate: false, latest: null, url: null, checkedAt: now, error: true };
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(info));
  } catch {
    /* ignore */
  }
  return info;
}
