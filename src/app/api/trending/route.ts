import { NextRequest, NextResponse } from "next/server";
import { getRegions, getTrending } from "@/lib/server/kworb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region") || "Global";
  try {
    const [regions, tracks] = await Promise.all([
      getRegions(),
      getTrending(region),
    ]);
    return NextResponse.json({ region, regions, tracks });
  } catch (e) {
    console.error("trending error:", e);
    return NextResponse.json(
      { region, regions: ["Global"], tracks: [], error: "trending_failed" },
      { status: 502 }
    );
  }
}
