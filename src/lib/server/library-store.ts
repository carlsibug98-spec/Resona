/**
 * Library storage (likes / playlists / history) on SQLite. The client's
 * zustand store stays the UI's immediate source of truth (instant, works
 * before the network); this module mirrors every change into the database
 * and serves the full snapshot at boot, so:
 *   - history is no longer capped at 60 by localStorage limits
 *   - the same library follows the user across a web-profile reset or a
 *     localStorage wipe, and survives server restarts
 *   - backup export/restore can read and write one authoritative copy
 *
 * Mirror writes are fire-and-forget from the client's perspective: a failed
 * write is logged, never surfaced — the app behaves exactly like before when
 * storage is unavailable.
 */
import { asc, desc, eq } from "drizzle-orm";
// explicit .ts extensions: this chain is imported directly by node --test,
// which (unlike the bundler) needs real file names
import { dbReady, likes, playlists, playlistTracks, history } from "./db.ts";
import type { Track } from "../types.ts";

export interface LikedRow {
  track: Track;
  likedAt: number;
}
export interface PlaylistRow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
}
export interface HistoryRow {
  track: Track;
  at: number;
}
export interface LibrarySnapshot {
  liked: Record<string, LikedRow>;
  playlists: PlaylistRow[];
  history: HistoryRow[];
}

export const HISTORY_LIMIT = 500;

/** in-memory fallback so the API stays functional without the DB */
const mem = {
  liked: new Map<string, LikedRow>(),
  playlists: new Map<string, PlaylistRow>(),
  history: new Map<string, HistoryRow>(),
};

function parse<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

/* ------------------------------- snapshot ------------------------------- */

export async function getLibrary(): Promise<LibrarySnapshot> {
  const c = await dbReady();
  if (!c) {
    return {
      liked: Object.fromEntries(mem.liked),
      playlists: [...mem.playlists.values()],
      history: [...mem.history.values()].sort((a, b) => b.at - a.at),
    };
  }
  try {
    const [likeRows, plRows, ptRows, histRows] = await Promise.all([
      c.db.select().from(likes).orderBy(desc(likes.likedAt)),
      c.db.select().from(playlists).orderBy(desc(playlists.updatedAt)),
      c.db.select().from(playlistTracks).orderBy(asc(playlistTracks.position)),
      c.db.select().from(history).orderBy(desc(history.playedAt)).limit(HISTORY_LIMIT),
    ]);
    const liked: Record<string, LikedRow> = {};
    for (const r of likeRows) liked[r.videoId] = { track: parse(r.track), likedAt: r.likedAt };
    const pls: PlaylistRow[] = plRows.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      tracks: [],
    }));
    const byId = new Map(pls.map((p) => [p.id, p]));
    for (const pt of ptRows) byId.get(pt.playlistId)?.tracks.push(parse(pt.track));
    const hist: HistoryRow[] = histRows.map((h) => ({
      track: parse(h.track),
      at: h.playedAt,
    }));
    return { liked, playlists: pls, history: hist };
  } catch (e) {
    console.error("[db] getLibrary failed:", e);
    return { liked: {}, playlists: [], history: [] };
  }
}

/* --------------------------------- likes -------------------------------- */

export async function putLike(track: Track, likedAt: number) {
  const c = await dbReady();
  if (!c) return void mem.liked.set(track.videoId, { track, likedAt });
  try {
    await c.db
      .insert(likes)
      .values({ videoId: track.videoId, track: JSON.stringify(track), likedAt })
      .onConflictDoUpdate({
        target: likes.videoId,
        set: { track: JSON.stringify(track), likedAt },
      });
  } catch (e) {
    console.error("[db] putLike failed:", e);
  }
}

export async function deleteLike(videoId: string) {
  const c = await dbReady();
  if (!c) return void mem.liked.delete(videoId);
  try {
    await c.db.delete(likes).where(eq(likes.videoId, videoId));
  } catch (e) {
    console.error("[db] deleteLike failed:", e);
  }
}

/* ------------------------------- playlists ------------------------------ */

export async function putPlaylist(p: PlaylistRow) {
  const c = await dbReady();
  if (!c) return void mem.playlists.set(p.id, p);
  try {
    await c.db
      .insert(playlists)
      .values({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt })
      .onConflictDoUpdate({
        target: playlists.id,
        set: { name: p.name, updatedAt: p.updatedAt },
      });
    // rewrite track rows only when the payload carries tracks (a rename
    // passes the same array back; a reorder/add/remove sends the new one)
    await c.db.delete(playlistTracks).where(eq(playlistTracks.playlistId, p.id));
    if (p.tracks.length) {
      await c.db.insert(playlistTracks).values(
        p.tracks.map((t, i) => ({
          playlistId: p.id,
          position: i,
          track: JSON.stringify(t),
        }))
      );
    }
  } catch (e) {
    console.error("[db] putPlaylist failed:", e);
  }
}

export async function deletePlaylist(id: string) {
  const c = await dbReady();
  if (!c) return void mem.playlists.delete(id);
  try {
    await c.db.delete(playlistTracks).where(eq(playlistTracks.playlistId, id));
    await c.db.delete(playlists).where(eq(playlists.id, id));
  } catch (e) {
    console.error("[db] deletePlaylist failed:", e);
  }
}

/* -------------------------------- history ------------------------------- */

export async function pushHistory(track: Track, at: number) {
  const c = await dbReady();
  if (!c) {
    mem.history.set(track.videoId, { track, at });
    trimMemHistory();
    return;
  }
  try {
    await c.db
      .insert(history)
      .values({ videoId: track.videoId, track: JSON.stringify(track), playedAt: at })
      .onConflictDoUpdate({
        target: history.videoId,
        set: { track: JSON.stringify(track), playedAt: at },
      });
  } catch (e) {
    console.error("[db] pushHistory failed:", e);
  }
}

function trimMemHistory() {
  if (mem.history.size <= HISTORY_LIMIT) return;
  const sorted = [...mem.history.values()].sort((a, b) => b.at - a.at);
  for (const h of sorted.slice(HISTORY_LIMIT)) mem.history.delete(h.track.videoId);
}

/** remove one video from history (unseed migration, "remove from history") */
export async function deleteHistory(videoId: string) {
  const c = await dbReady();
  if (!c) {
    mem.history.delete(videoId);
    return;
  }
  try {
    await c.db.delete(history).where(eq(history.videoId, videoId));
  } catch (e) {
    console.error("[db] deleteHistory failed:", e);
  }
}

/** full replace — backup restore in "replace" mode, and "clear all" */
export async function replaceLibrary(snap: LibrarySnapshot) {
  const c = await dbReady();
  if (!c) {
    mem.liked = new Map(Object.entries(snap.liked));
    mem.playlists = new Map(snap.playlists.map((p) => [p.id, p]));
    mem.history = new Map(snap.history.map((h) => [h.track.videoId, h]));
    trimMemHistory();
    return;
  }
  try {
    await c.db.delete(likes);
    await c.db.delete(playlistTracks);
    await c.db.delete(playlists);
    await c.db.delete(history);
    if (Object.keys(snap.liked).length) {
      await c.db.insert(likes).values(
        Object.entries(snap.liked).map(([videoId, l]) => ({
          videoId,
          track: JSON.stringify(l.track),
          likedAt: l.likedAt,
        }))
      );
    }
    for (const p of snap.playlists) await putPlaylist(p);
    if (snap.history.length) {
      await c.db.insert(history).values(
        snap.history.map((h) => ({
          videoId: h.track.videoId,
          track: JSON.stringify(h.track),
          playedAt: h.at,
        }))
      );
    }
  } catch (e) {
    console.error("[db] replaceLibrary failed:", e);
  }
}
