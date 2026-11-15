import { NextRequest, NextResponse } from "next/server";
import { browsePlaylist } from "@/lib/server/innertube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  try {
    const page = await browsePlaylist(id);
    return NextResponse.json(page);
  } catch (e) {
    console.error("playlist error:", e);
    return NextResponse.json({ error: "playlist_failed" }, { status: 502 });
  }
}
