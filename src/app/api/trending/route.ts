import { NextRequest, NextResponse } from "next/server";
import { getRegions, getTrending } from "@/lib/server/kworb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region") || "Global";
  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "40", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 40, 1), 100);
  try {
    // getRegions never throws (kworb down → just ["Global"]) — only a total
    // failure of BOTH kworb and the YouTube Charts fallback lands in the catch
    const [regions, result] = await Promise.all([
      getRegions(),
      getTrending(region, limit),
    ]);
    return NextResponse.json({ region, regions, tracks: result.tracks, source: result.source });
  } catch (e) {
    console.error("trending error:", e);
    return NextResponse.json(
      { region, regions: ["Global"], tracks: [], error: "trending_failed" },
      { status: 502 }
    );
  }
}
