/**
 * yt-dlp runtime manager.
 *
 * yt-dlp is the most reliable audio resolver, but the desktop bundle only
 * ships a snapshot that goes stale as YouTube changes. This module:
 *
 *  1. finds a usable binary — the one bundled with the desktop app
 *     (YTDLP_PATH), an auto-downloaded copy in a user-writable bin dir,
 *     or one on the system PATH;
 *  2. downloads the latest release on demand (atomic, single-flight);
 *  3. refreshes it when the installed copy is much older than the newest
 *     release, or when a resolve fails with an "update" hint;
 *  4. reports status so the UI can hide the download button on servers
 *     where nothing works, and show progress while it sets itself up.
 *
 * Everything here is plain Node (no npm deps) so it runs inside the Next.js
 * standalone server in Electron and in bare `npm run dev`.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchWithTimeout } from "./cache";

export interface YtDlpStatus {
  state: "unknown" | "provisioning" | "ready" | "failed";
  /** where the working binary came from: bundled | provisioned | path */
  source?: "bundled" | "provisioned" | "path";
  version?: string;
  error?: string;
}

const GITHUB_LATEST = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
/** re-check the newest yt-dlp release at most this often */
const REFRESH_AFTER_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
/** a plausible binary is at least this big (the real ones are 15–45 MB) */
const MIN_BINARY_BYTES = 5 * 1024 * 1024;

function assetName(): string {
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  return "yt-dlp_linux";
}

function binDir(): string {
  // Electron passes the per-user data dir; web/dev falls back to ~/.resona
  const base =
    process.env.RESONA_DATA_DIR || path.join(os.homedir(), ".resona");
  return path.join(base, "bin");
}

function provisionedBinary(): string {
  return path.join(binDir(), process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}

/** every place a usable binary could live, in priority order */
export function candidatePaths(): { path: string; source: YtDlpStatus["source"] }[] {
  const out: { path: string; source: YtDlpStatus["source"] }[] = [];
  if (process.env.YTDLP_PATH) out.push({ path: process.env.YTDLP_PATH, source: "bundled" });
  out.push({ path: provisionedBinary(), source: "provisioned" });
  out.push({ path: "yt-dlp", source: "path" }); // resolved from PATH by execFile
  return out;
}

let status: YtDlpStatus = { state: "unknown" };
let lastWorkingPath: string | null = null;
let lastRefreshCheck = 0;
let ensurePromise: Promise<YtDlpStatus> | null = null;

export function getYtDlpStatus(): YtDlpStatus {
  return status;
}

function setStatus(s: YtDlpStatus) {
  status = s;
}

function runBinary(
  bin: string,
  args: string[],
  timeoutMs = 15000
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ""), stderr: String(stderr || "") })
    );
  });
}

/** quick probe: does this binary execute and print a version? */
async function probe(bin: string): Promise<string | null> {
  const r = await runBinary(bin, ["--version"], 10000);
  if (!r.ok) return null;
  const v = r.stdout.trim();
  return /^\d{4}\.\d{2}\.\d{2}/.test(v) ? v : null;
}

async function fetchLatestVersion(): Promise<string | null> {
  const res = await fetchWithTimeout(GITHUB_LATEST, { headers: { Accept: "application/vnd.github+json" } }, 10000);
  if (!res.ok) return null;
  const data = (await res.json()) as { tag_name?: string };
  return data.tag_name ? data.tag_name.replace(/^v/, "").trim() : null;
}

async function downloadBinary(dest: string): Promise<void> {
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName()}`;
  const res = await fetchWithTimeout(url, {}, 180000);
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_BINARY_BYTES) throw new Error(`download suspiciously small (${buf.length} bytes)`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".download";
  fs.writeFileSync(tmp, buf);
  if (process.platform !== "win32") fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, dest); // atomic on the same filesystem
}

/**
 * Make sure a working yt-dlp exists. Safe to call as often as you like —
 * it's single-flight and cheap when a binary already works.
 */
export function ensureYtDlp(force = false): Promise<YtDlpStatus> {
  if (ensurePromise && !force) return ensurePromise;
  ensurePromise = (async (): Promise<YtDlpStatus> => {
    // 1. try the candidates we already have
    for (const { path: bin, source } of candidatePaths()) {
      if (bin === "yt-dlp" && lastWorkingPath && lastWorkingPath !== "yt-dlp") continue;
      const version = await probe(bin);
      if (version) {
        lastWorkingPath = bin;
        setStatus({ state: "ready", source, version });
        maybeRefresh(version).catch(() => {});
        return status;
      }
    }

    // 2. nothing usable — download the latest release
    setStatus({ state: "provisioning" });
    try {
      const dest = provisionedBinary();
      await downloadBinary(dest);
      const version = await probe(dest);
      if (!version) throw new Error("downloaded binary does not run");
      lastWorkingPath = dest;
      lastRefreshCheck = Date.now();
      setStatus({ state: "ready", source: "provisioned", version });
      return status;
    } catch (e) {
      setStatus({
        state: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
      return status;
    }
  })();
  // allow a forced re-run later even if this one failed
  ensurePromise.finally(() => {
    if (status.state === "failed") ensurePromise = null;
  });
  return ensurePromise;
}

/** background: if the working copy is old, check for a newer release quietly */
async function maybeRefresh(currentVersion: string): Promise<void> {
  if (Date.now() - lastRefreshCheck < REFRESH_AFTER_MS) return;
  lastRefreshCheck = Date.now();
  try {
    const latest = await fetchLatestVersion();
    if (!latest || latest === currentVersion) return;
    const dest = provisionedBinary();
    await downloadBinary(dest);
    const version = await probe(dest);
    if (version) {
      lastWorkingPath = dest;
      setStatus({ state: "ready", source: "provisioned", version });
    }
  } catch {
    /* keep using the current binary */
  }
}

/** true when yt-dlp failed in a way that a newer build might fix */
export function looksStale(stderr: string): boolean {
  return /please update|update yt-dlp|unsupported|signature|nsig|failed to extract/i.test(stderr);
}

export interface YtDlpRun {
  ok: boolean;
  url?: string;
  stderr: string;
}

/** Resolve a direct audio URL, retrying once with a fresh binary if stale. */
export async function resolveWithYtDlp(videoId: string): Promise<YtDlpRun> {
  const attempt = async (): Promise<YtDlpRun> => {
    const bin = lastWorkingPath || "yt-dlp";
    const r = await runBinary(
      bin,
      [
        "-f", "140/251/bestaudio",
        "-g",
        "--no-warnings",
        "--no-playlist",
        "--socket-timeout", "12",
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      30000
    );
    if (!r.ok) return { ok: false, stderr: r.stderr || "exec failed" };
    const lines = r.stdout.trim().split("\n").filter(Boolean);
    const url = lines.length ? lines[lines.length - 1] : "";
    if (!url.startsWith("http")) return { ok: false, stderr: r.stderr || "no url" };
    return { ok: true, url, stderr: "" };
  };

  let result = await attempt();
  if (!result.ok && (looksStale(result.stderr) || !lastWorkingPath)) {
    // a forced ensure re-downloads the newest release, then retry once
    lastWorkingPath = null;
    const s = await ensureYtDlp(true);
    if (s.state === "ready") result = await attempt();
  }
  return result;
}
