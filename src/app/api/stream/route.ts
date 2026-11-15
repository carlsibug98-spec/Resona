import { NextRequest, NextResponse } from "next/server";
import { resolveStream } from "@/lib/server/resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"];

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")?.trim();
  const instances = req.nextUrl.searchParams.get("instances");
  const resolveOnly = req.nextUrl.searchParams.get("resolve") === "1";
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
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

  try {
    const range = req.headers.get("range");
    const upstream = await fetch(result.url, {
      headers: range ? { Range: range } : {},
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "upstream_error", status: upstream.status }, { status: 502 });
    }
    const headers = new Headers();
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has("content-type")) headers.set("content-type", result.mime || "audio/mp4");
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "no-store");
    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers,
    });
  } catch {
    return NextResponse.json({ error: "proxy_failed" }, { status: 502 });
  }
}
