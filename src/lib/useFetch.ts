"use client";

import { useEffect, useRef, useState } from "react";

export interface AsyncEntry<T> {
  state: "loading" | "ready" | "error";
  data: T | null;
}

/**
 * Small cached data hook: fetches once per key (region change, artist id,
 * album id), keeps previous results alive and never calls setState
 * synchronously inside the effect body.
 */
export function useAsyncData<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>
): AsyncEntry<T> {
  const [store, setStore] = useState<Record<string, AsyncEntry<T>>>({});
  const entry = store[key];
  // the fetcher is an inline closure — keep the latest one in a ref,
  // assigned in an effect so refs are never touched during render
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    fetcherRef.current(ctrl.signal)
      .then((data) => {
        if (!cancelled) setStore((s) => ({ ...s, [key]: { state: "ready", data } }));
      })
      .catch(() => {
        if (!cancelled)
          setStore((s) => (s[key] ? s : { ...s, [key]: { state: "error", data: null } }));
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [key]);

  return entry ?? { state: "loading", data: null };
}
