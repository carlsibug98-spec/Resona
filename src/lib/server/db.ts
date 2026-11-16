/**
 * SQLite storage for the server (TTL cache + library), via libsql + Drizzle.
 *
 * libsql *is* SQLite (same file format); its N-API binding loads under plain
 * Node, Bun and Electron-as-Node without ABI rebuilds, which better-sqlite3
 * cannot promise in the packaged desktop app.
 *
 * The `@libsql/client` import is DYNAMIC and wrapped in try/catch: the
 * package's native binding (`@libsql/<platform>/index.node`) is resolved at
 * require time, and a build staged on the wrong OS (e.g. Linux natives
 * shipped inside a Windows zip) would otherwise throw at module load —
 * taking every API route that touches the cache (search, trending, lyrics,
 * catalog, …) down with a 500. Here a missing native just means "no
 * database, memory only", exactly like any other open failure.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Client } from "@libsql/client";
import type { drizzle as drizzleFn } from "drizzle-orm/libsql";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** generic TTL cache rows — the persistent twin of server/cache.ts's Map */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON-encoded
  expiresAt: integer("expires_at").notNull(), // epoch ms
});

export const likes = sqliteTable("likes", {
  videoId: text("video_id").primaryKey(),
  track: text("track").notNull(), // JSON Track
  likedAt: integer("liked_at").notNull(),
});

export const playlists = sqliteTable("playlists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** position is the playlist's track order; gaps after removals are fine */
export const playlistTracks = sqliteTable(
  "playlist_tracks",
  {
    playlistId: text("playlist_id").notNull(),
    position: integer("position").notNull(),
    track: text("track").notNull(), // JSON Track
  },
  (t) => [primaryKey({ columns: [t.playlistId, t.position] })],
);

export const history = sqliteTable("history", {
  videoId: text("video_id").primaryKey(),
  track: text("track").notNull(), // JSON Track
  playedAt: integer("played_at").notNull(),
});

export type Db = {
  client: Client;
  db: ReturnType<typeof drizzleFn>;
  /** resolves once the schema exists; always resolves, even on failure */
  ready: Promise<void>;
};

// created lazily: undefined = not opened yet, null = unavailable
let ctx: Db | null | undefined;

const DDL = `
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS likes (
    video_id TEXT PRIMARY KEY,
    track TEXT NOT NULL,
    liked_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    track TEXT NOT NULL,
    PRIMARY KEY (playlist_id, position)
  );
  CREATE TABLE IF NOT EXISTS history (
    video_id TEXT PRIMARY KEY,
    track TEXT NOT NULL,
    played_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_history_played ON history(played_at DESC);
`;

/** `node --test` sets NODE_TEST_CONTEXT: unit tests stay memory-only unless
 *  a test forces a path, so `npm test` never touches the filesystem. */
export function dbEnabled(): boolean {
  if (process.env.NODE_TEST_CONTEXT && !process.env.RESONA_DB_PATH) return false;
  return true;
}

/** Synchronous module loader that works in CJS (Next server bundle) and ESM
 *  (node --test) alike, and never throws — a missing module resolves null.
 *  This is the load-bearing try/catch: `libsql/index.js` resolves its native
 *  binding with a bare `require("@libsql/<platform>")` at module load, so a
 *  wrong-OS build (Linux natives inside the Windows package) makes the
 *  import itself throw. Catching it here keeps every API route alive. */
function safeRequire<T>(id: string): T | null {
  try {
    const req: NodeRequire =
      typeof require === "function"
        ? require
        : createRequire(import.meta.url);
    return req(id) as T;
  } catch {
    return null;
  }
}

function open(): Db | null {
  const file = process.env.RESONA_DB_PATH || path.join(process.cwd(), "resona.db");
  const clientMod = safeRequire<typeof import("@libsql/client")>("@libsql/client");
  const drizzleMod = safeRequire<typeof import("drizzle-orm/libsql")>("drizzle-orm/libsql");
  if (!clientMod || !drizzleMod) {
    console.error(
      "[db] libsql/drizzle unavailable (missing package or wrong-OS native binding) — continuing memory-only"
    );
    return null;
  }
  let client: Client;
  try {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    client = clientMod.createClient({ url: "file:" + file });
  } catch (e) {
    console.error("[db] cannot open", file, "— continuing memory-only:", e);
    return null;
  }
  const c: Db = {
    client,
    db: drizzleMod.drizzle(client),
    ready: (async () => {
      try {
        await client.executeMultiple(
          "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;" +
            DDL
        );
      } catch (e) {
        console.error("[db] schema init failed — continuing memory-only:", e);
        // storage becomes unavailable, not broken — but only if this client
        // is still the app's singleton (a rapid reopen may have replaced it)
        if (ctx?.client === client) ctx = null;
      }
    })(),
  };
  return c;
}

/** The single app database, or null when storage is unavailable/disabled. */
export function getDb(): Db | null {
  if (ctx !== undefined) return ctx;
  ctx = dbEnabled() ? open() : null;
  return ctx;
}

/** Resolves once the schema is ready; no-op promise when there is no DB. */
export async function dbReady(): Promise<Db | null> {
  const c = getDb();
  if (!c) return null;
  await c.ready;
  return getDb(); // re-check: init may have failed
}
