import { NextResponse } from "next/server";
import { getHomeCatalog } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Global home shelves: popular artists / releases / new releases */
export async function GET() {
  try {
    const catalog = await getHomeCatalog();
    return NextResponse.json(catalog);
  } catch (e) {
    console.error("catalog error:", e);
    return NextResponse.json(
      { artists: [], releases: [], newReleases: [], error: "catalog_failed" },
      { status: 502 }
    );
  }
}
