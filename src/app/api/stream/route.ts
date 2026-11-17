import { NextRequest, NextResponse } from "next/server";
import { resolveStream, diagnoseStream } from "@/lib/server/resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"];

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")?.trim();
  const instances = req.nextUrl.searchParams.get("instances");
  const resolveOnly = req.nextUrl.searchParams.get("resolve") === "1";
  const diagnose = req.nextUrl.searchParams.get("diagnose") === "1";
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  // diagnostics mode: every provider independently, with timings — the
  // "why won't anything play" report (Settings → Playback diagnostics)
  if (diagnose) {
    const report = await diagnoseStream(videoId, instances);
    return NextResponse.json(report);
  }

  const result = await resolveStream(videoId, instances);

  // JSON metadata mode (settings health check, diagnostics)
  if (resolveOnly) {
    return NextResponse.json(result);
  }

  // Proxy mode — stream the audio bytes through this server.
  // googlevideo URLs are IP-bound to the server, and cross-origin fetches
  // from the browser would be blocked anyway, so proxying is the only
  // reliable way to serve direct streams to the client.
  if (!result.url) {
    return NextResponse.json(
      { error: "unresolvable", provider: null },
      { status: 502 }
    );
  }

  // first attempt with the cached URL; when it fails upstream, re-resolve
  // once with fresh=1 — cached googlevideo URLs expire (~6h) and instances
  // go down between resolve and play, and without this the proxy would
  // keep serving the same dead URL until the 30-minute cache TTL ran out.
  const range = req.headers.get("range");
  const first = await proxyFetch(result.url, range);
  if (first) return shapeAudio(first, result.mime);

  const fresh = await resolveStream(videoId, instances, { fresh: true }).catch(() => null);
  if (fresh?.url) {
    const second = await proxyFetch(fresh.url, range);
    if (second) return shapeAudio(second, fresh.mime);
  }
  return NextResponse.json({ error: "proxy_failed" }, { status: 502 });
}

/** fetch upstream bytes; null on any failure so callers can re-resolve */
async function proxyFetch(url: string, range: string | null): Promise<Response | null> {
  try {
    const upstream = await fetch(url, {
      headers: range ? { Range: range } : {},
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) return null;
    return upstream;
  } catch {
    return null;
  }
}

/** shape the proxied bytes as an audio response with Range support */
function shapeAudio(upstream: Response, mime?: string): Response {
  const headers = new Headers();
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("content-type")) headers.set("content-type", mime || "audio/mp4");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}
