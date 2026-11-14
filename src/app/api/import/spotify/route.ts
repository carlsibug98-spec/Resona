import { NextRequest, NextResponse } from "next/server";
import { importSpotifyPlaylist } from "@/lib/server/spotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim();
  if (!url) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }
  try {
    const result = await importSpotifyPlaylist(url);
    return NextResponse.json(result);
  } catch (e) {
    console.error("import error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "import_failed" },
      { status: 502 }
    );
  }
}
