import { NextRequest, NextResponse } from "next/server";
import { getLyrics } from "@/lib/server/lrclib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title")?.trim();
  const artist = req.nextUrl.searchParams.get("artist")?.trim() || "";
  const duration = parseInt(req.nextUrl.searchParams.get("duration") || "0", 10);
  if (!title) return NextResponse.json({ synced: null, plain: null, source: "none" });
  try {
    const lyrics = await getLyrics(title, artist, duration || undefined);
    return NextResponse.json(lyrics);
  } catch (e) {
    console.error("lyrics error:", e);
    return NextResponse.json({ synced: null, plain: null, source: "none" });
  }
}
