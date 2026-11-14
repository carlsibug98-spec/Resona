import { NextResponse } from "next/server";
import { getDownloadCapability } from "@/lib/server/resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Reports whether downloads can work on this server, and whether yt-dlp is
 * still being set up. The UI uses this to show/hide the download button.
 */
export async function GET() {
  try {
    const capability = await getDownloadCapability();
    return NextResponse.json(capability);
  } catch {
    return NextResponse.json(
      { provider: "none", provisioning: false },
      { status: 200 }
    );
  }
}
