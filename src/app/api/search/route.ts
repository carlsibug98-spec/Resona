import { NextRequest, NextResponse } from "next/server";
import { searchTracks } from "@/lib/server/innertube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const filter =
    req.nextUrl.searchParams.get("filter") === "videos" ? "videos" : "songs";
  if (!q) return NextResponse.json({ tracks: [] });
  try {
    const tracks = await searchTracks(q, filter);
    return NextResponse.json({ tracks });
  } catch (e) {
    console.error("search error:", e);
    return NextResponse.json({ tracks: [], error: "search_failed" }, { status: 502 });
  }
}
