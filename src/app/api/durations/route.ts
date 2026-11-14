import { NextRequest, NextResponse } from "next/server";
import { getDurations } from "@/lib/server/innertube";

export const dynamic = "force-dynamic";

/**
 * GET /api/durations?ids=a,b,c
 * Returns { videoId: seconds } for tracks whose duration YT Music
 * omitted (official song rows). Server-side cached per id for a week.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("ids") || "";
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z0-9_-]{6,20}$/.test(s))
    ),
  ].slice(0, 60);
  if (!ids.length) return NextResponse.json({});
  try {
    const durations = await getDurations(ids);
    return NextResponse.json(durations);
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
