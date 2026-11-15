import { NextRequest, NextResponse } from "next/server";
import { getCredits } from "@/lib/server/musicbrainz";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Full-screen credits card: real writers/producers from MusicBrainz. */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title")?.trim();
  const artist = req.nextUrl.searchParams.get("artist")?.trim();
  if (!title || !artist) {
    return NextResponse.json({ source: "none", persons: [] });
  }
  const credits = await getCredits(title, artist);
  return NextResponse.json(credits, {
    headers: { "cache-control": "public, max-age=86400" },
  });
}
