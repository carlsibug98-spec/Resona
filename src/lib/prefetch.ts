"use client";

/**
 * Warm the server-side stream cache before a song is actually played.
 *
 * The first play of a track normally pays for stream resolution on the
 * critical path: /api/stream spawns yt-dlp (up to ~25 s) and falls back to
 * Piped/Invidious instances before the first audio byte moves. Firing
 * /api/stream?resolve=1 while the listener hovers or presses a row moves
 * that cost off the click: by the time play is pressed the resolution is
 * already cached server-side (30 min TTL) and only buffering remains.
 *
 * Results are remembered per session so sweeping a long list with the
 * cursor doesn't spam the API — every unique videoId resolves once.
 */

const attempted = new Set<string>();

export function prefetchStream(videoId: string | null | undefined): void {
  if (!videoId || attempted.has(videoId)) return;
  attempted.add(videoId);
  fetch(`/api/stream?resolve=1&videoId=${encodeURIComponent(videoId)}`).catch(() => {
    // allow a retry later if the network was down
    attempted.delete(videoId);
  });
}
