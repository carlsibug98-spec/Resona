/**
 * The User-Agent the Electron renderer's <audio> element sends for media
 * requests. googlevideo URLs are not always UA-locked, but Musify's
 * bundled youtube_explode documents that they CAN be — so every probe
 * that stands in for the player uses this identity.
 */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * TTL cache: in-memory Map for the hot path (sync reads stay sync), now
 * backed by SQLite so a restart starts warm. Before this, every resolved
 * stream URL, search page, lyrics payload, artist page and trending chart
 * was lost on each server restart — and resolving a stream can cost up to
 * 25 seconds through yt-dlp.
 *
 * Writes go to both layers; reads hit the Map first and fall back to an
 * in-memory "loaded from disk" layer filled at boot. So every existing
 * consumer (musicbrainz, innertube, resolver, lrclib, catalog, kworb,
 * spotify) keeps its synchronous cacheGet — no call-site changes.
 *
 * Failures of the SQLite layer are swallowed: cache.ts must never be the
 * reason a request fails or the server refuses to boot.
 */
// explicit .ts extension: this module is imported directly by node --test,
// which (unlike the bundler) needs the real file name
import { dbReady, getDb } from "./db.ts";

const store = new Map<string, { v: unknown; e: number }>();

const MAX_ENTRIES = 800;

/** rows restored from SQLite at boot — second lookup layer, same shape */
const restored = new Map<string, { v: unknown; e: number }>();

let started = false;

/** SQLite writes are awaited by `cached()` but never block the sync API. */
async function persist(key: string, entry: { v: unknown; e: number }) {
  const c = await dbReady();
  if (!c) return;
  try {
    await c.client.execute({
      sql: "INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)",
      args: [key, JSON.stringify(entry.v), entry.e],
    });
  } catch {
    /* memory-only fallback is fine */
  }
}

/** Loads unexpired rows once, in the background, at first use. */
async function primeFromDisk() {
  const c = await dbReady();
  if (!c) return;
  try {
    const rs = await c.client.execute(
      "SELECT key, value, expires_at FROM kv WHERE expires_at > ? ORDER BY expires_at DESC",
      [Date.now()]
    );
    for (const row of rs.rows) {
      const key = String(row.key);
      if (store.has(key) || restored.has(key)) continue;
      try {
        restored.set(key, {
          v: JSON.parse(String(row.value)),
          e: Number(row.expires_at),
        });
      } catch {
        /* one corrupt row must not lose the rest */
      }
    }
    const dead = await c.client.execute(
      "DELETE FROM kv WHERE expires_at <= ?",
      [Date.now()]
    );
    if (dead.rowsAffected > 0) console.log(`[db] cache: pruned ${dead.rowsAffected} expired rows`);
  } catch {
    /* memory-only fallback is fine */
  }
}

function ensureStarted() {
  if (started) return;
  started = true;
  void primeFromDisk();
}

export function cacheGet<T>(key: string): T | null {
  ensureStarted();
  const hit = store.get(key);
  if (hit) {
    if (Date.now() > hit.e) {
      store.delete(key);
      return null;
    }
    return hit.v as T;
  }
  const disk = restored.get(key);
  if (disk) {
    if (Date.now() > disk.e) {
      restored.delete(key);
      return null;
    }
    return disk.v as T;
  }
  return null;
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  ensureStarted();
  if (store.size > MAX_ENTRIES) {
    // evict soonest-expiring half
    const entries = [...store.entries()].sort((a, b) => a[1].e - b[1].e);
    for (let i = 0; i < entries.length / 2; i++) store.delete(entries[i][0]);
  }
  const entry = { v: value, e: Date.now() + ttlMs };
  store.set(key, entry);
  restored.delete(key);
  void persist(key, entry);
}

const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;
  // share one computation between concurrent callers: a hover prefetch and
  // the click that follows it must not spawn two yt-dlp runs for the same id
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = (async () => {
    const v = await fn();
    cacheSet(key, v, ttlMs);
    return v;
  })();
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    // a rejection is not cached (same as before) — drop the slot so the
    // next caller can retry; never clobber a newer computation's slot
    if (inflight.get(key) === promise) inflight.delete(key);
  }
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx]);
      } catch {
        results[idx] = null as unknown as R;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = 10000
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    ...opts,
    signal: ctrl.signal,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      ...(opts.headers || {}),
    },
  }).finally(() => clearTimeout(timer));
}

/**
 * Verify a resolved stream URL actually serves audio bytes before it is
 * trusted: fetch 1 byte with a Range header and require an OK/206 answer.
 *
 * This is the difference between "resolved" and "playable": Piped
 * instances happily hand out googlevideo URLs that 403 a moment later,
 * InnerTube can answer from a client whose URLs expire instantly, and
 * an expired cached URL still resolves on paper. In-process players
 * (Musify's youtube_explode, OpenSpot's shared streaming core) never
 * see this problem because the process that resolves the URL is the
 * process that plays it — resolution failure IS playback failure, and
 * the next candidate is tried. Resona resolves server-side and plays
 * browser-side, so this explicit probe replaces that implicit
 * guarantee: without it, the first dead-but-fast URL wins a provider
 * race and gets cached for 30 minutes as a "hit" — the user hears
 * nothing until the cache dies.
 *
 * One range probe adds ~100-300 ms to a resolve, and only on the verify
 * step — the media request itself then starts from byte 0.
 */
export async function verifyAudioUrl(url: string, ms = 5000, ua?: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          Range: "bytes=0-1",
          // probe with the identity the URL will actually be fetched
          // with. Musify's bundled youtube_explode documents that
          // googlevideo ties app-client URLs (ANDROID_VR / ANDROID / IOS)
          // to the minting client's User-Agent and 403s a mismatched
          // desktop-Chrome probe "even for a perfectly valid,
          // PO-Token-exempt stream" — so the caller passes the UA of the
          // client that minted the URL; callers probing on behalf of the
          // browser omit it and get BROWSER_UA.
          "User-Agent": ua || BROWSER_UA,
        },
      },
      ms
    );
    // 200/206 = the host answered with a body; 4xx/5xx = dead or gated
    // (403: expired/gated googlevideo, 429: instance rate-limit)
    const ok = res.ok || res.status === 206;
    // servers that ignore Range answer 200 with the FULL body — cancel
    // it or the probe turns into a whole-file download
    try {
      res.body?.cancel();
    } catch {
      /* already closed */
    }
    return ok;
  } catch {
    return false;
  }
}
