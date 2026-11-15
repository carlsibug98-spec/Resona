import { NextRequest, NextResponse } from "next/server";
import {
  putLike,
  deleteLike,
  putPlaylist,
  deletePlaylist,
  pushHistory,
} from "@/lib/server/library-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function asTrack(v: unknown): { videoId: string; title: string; artist: string; thumb: string } | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  if (typeof t.videoId !== "string" || !VIDEO_ID.test(t.videoId)) return null;
  if (typeof t.title !== "string" || typeof t.artist !== "string") return null;
  return {
    videoId: t.videoId,
    title: t.title.slice(0, 300),
    artist: t.artist.slice(0, 200),
    thumb: typeof t.thumb === "string" ? t.thumb.slice(0, 500) : "",
  };
}

/** POST /api/library/mutate — mirror client actions into SQLite, fire-and-forget style */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const action = String(body.action || "");

  switch (action) {
    case "like": {
      const track = asTrack(body.track);
      if (!track) return NextResponse.json({ error: "invalid_track" }, { status: 400 });
      await putLike(track, Number(body.likedAt) || Date.now());
      return NextResponse.json({ ok: true });
    }
    case "unlike": {
      const videoId = String(body.videoId || "");
      if (!VIDEO_ID.test(videoId)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
      await deleteLike(videoId);
      return NextResponse.json({ ok: true });
    }
    case "playlist": {
      const p = body.playlist as Record<string, unknown> | undefined;
      const id = typeof p?.id === "string" ? p.id.slice(0, 64) : "";
      const name = typeof p?.name === "string" ? p.name.slice(0, 120) : "";
      if (!id || !name) return NextResponse.json({ error: "invalid_playlist" }, { status: 400 });
      const tracks = Array.isArray(p?.tracks)
        ? (p!.tracks as unknown[]).map(asTrack).filter(Boolean)
        : [];
      if (Array.isArray(p?.tracks) && tracks.length !== (p!.tracks as unknown[]).length) {
        return NextResponse.json({ error: "invalid_track" }, { status: 400 });
      }
      await putPlaylist({
        id,
        name,
        createdAt: Number(p?.createdAt) || Date.now(),
        updatedAt: Number(p?.updatedAt) || Date.now(),
        tracks: tracks as never[],
      });
      return NextResponse.json({ ok: true });
    }
    case "playlist.delete": {
      const id = String(body.id || "");
      if (!id || id.length > 64) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
      await deletePlaylist(id);
      return NextResponse.json({ ok: true });
    }
    case "history": {
      const track = asTrack(body.track);
      if (!track) return NextResponse.json({ error: "invalid_track" }, { status: 400 });
      await pushHistory(track, Number(body.at) || Date.now());
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
