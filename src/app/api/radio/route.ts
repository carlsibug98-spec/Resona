import { NextRequest, NextResponse } from "next/server";
import { radioFor } from "@/lib/server/innertube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Song radio — YouTube Music's mix for the seed track
 * (what plays on auto-continue), deduped and track-shaped.
 */
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")?.trim();
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  try {
    const tracks = await radioFor(videoId);
    return NextResponse.json(
      { tracks },
      { headers: { "cache-control": "public, max-age=3600" } }
    );
  } catch {
    return NextResponse.json({ error: "radio_failed" }, { status: 502 });
  }
}
