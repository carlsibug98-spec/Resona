const store = new Map<string, { v: unknown; e: number }>();

const MAX_ENTRIES = 800;

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.e) {
    store.delete(key);
    return null;
  }
  return hit.v as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  if (store.size > MAX_ENTRIES) {
    // evict soonest-expiring half
    const entries = [...store.entries()].sort((a, b) => a[1].e - b[1].e);
    for (let i = 0; i < entries.length / 2; i++) store.delete(entries[i][0]);
  }
  store.set(key, { v: value, e: Date.now() + ttlMs });
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;
  const v = await fn();
  cacheSet(key, v, ttlMs);
  return v;
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
