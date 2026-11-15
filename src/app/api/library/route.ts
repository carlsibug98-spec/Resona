import { NextRequest, NextResponse } from "next/server";
import { getLibrary, replaceLibrary, HISTORY_LIMIT } from "@/lib/server/library-store";
import { parseBackupText } from "@/lib/backup-parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/library — the authoritative snapshot for client boot */
export async function GET() {
  const snap = await getLibrary();
  return NextResponse.json({ ...snap, historyLimit: HISTORY_LIMIT });
}

/**
 * PUT /api/library — full replace (used by backup restore). The body is the
 * same shape the client store keeps: { liked, playlists, history }. Sizes are
 * capped like a backup file so the endpoint cannot be used to balloon the DB.
 */
export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = JSON.stringify(body ?? {});
  if (text.length > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  // reuse the strict validator from backup-parse: it enforces shapes, videoId
  // format and title/artist/name lengths, so nothing malformed enters the DB.
  // parseBackupText rejects an all-empty library, but "clear all" legitimately
  // sends one — short-circuit that before validating.
  const looksEmpty =
    typeof body === "object" &&
    body !== null &&
    Object.keys(body).length === 3 &&
    (body as Record<string, unknown>).liked != null &&
    Object.keys((body as Record<string, unknown>).liked as object).length === 0 &&
    Array.isArray((body as Record<string, unknown>).playlists) &&
    ((body as Record<string, unknown>).playlists as unknown[]).length === 0 &&
    Array.isArray((body as Record<string, unknown>).history) &&
    ((body as Record<string, unknown>).history as unknown[]).length === 0;
  let parsed;
  try {
    parsed = looksEmpty
      ? { liked: {}, playlists: [], history: [] }
      : parseBackupText(text, text.length);
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_library", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
  await replaceLibrary({
    liked: parsed.liked,
    playlists: parsed.playlists,
    history: parsed.history,
  });
  return NextResponse.json({ ok: true });
}
