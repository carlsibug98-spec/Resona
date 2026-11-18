import { NextRequest, NextResponse } from "next/server";
import {
  searchTracks,
  searchArtists,
  searchCollections,
  getSuggestions,
} from "@/lib/server/innertube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const filter =
    req.nextUrl.searchParams.get("filter") === "videos" ? "videos" : "songs";
  const suggest = req.nextUrl.searchParams.get("suggest") === "1";
  const collections = req.nextUrl.searchParams.get("collections") === "1";
  if (!q) return NextResponse.json({ tracks: [], artists: [] });

  // suggestion mode: just the query-completion list for the dropdown
  if (suggest) {
    const suggestions = await getSuggestions(q);
    return NextResponse.json({ suggestions });
  }

  try {
    // parallel; an artist/collection failure must not sink the songs
    // (collections=1: the full search page wants albums + community
    // playlists for its filter tabs — the dropdown omits them)
    const [tracks, artists, albums, playlists] = await Promise.all([
      searchTracks(q, filter),
      searchArtists(q).catch(() => []),
      ...(collections
        ? [searchCollections(q, "albums").catch(() => [])]
        : [Promise.resolve([])]),
      ...(collections
        ? [searchCollections(q, "community_playlists").catch(() => [])]
        : [Promise.resolve([])]),
    ]);
    return NextResponse.json({ tracks, artists, albums, playlists });
  } catch (e) {
    console.error("search error:", e);
    // 502 (not 200-with-empty) so the UI can say "search is unreachable"
    // instead of an honest-looking "no results for X"
    return NextResponse.json(
      { tracks: [], artists: [], error: "search_failed" },
      { status: 502 }
    );
  }
}
