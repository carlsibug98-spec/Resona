import { NextRequest, NextResponse } from "next/server";
import { searchTracks, searchArtists } from "@/lib/server/innertube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const filter =
    req.nextUrl.searchParams.get("filter") === "videos" ? "videos" : "songs";
  if (!q) return NextResponse.json({ tracks: [], artists: [] });
  try {
    // both in parallel; an artist-list failure must not sink the songs
    const [tracks, artists] = await Promise.all([
      searchTracks(q, filter),
      searchArtists(q).catch(() => []),
    ]);
    return NextResponse.json({ tracks, artists });
  } catch (e) {
    console.error("search error:", e);
    return NextResponse.json({ tracks: [], artists: [], error: "search_failed" }, { status: 502 });
  }
}
