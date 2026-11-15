/**
 * SQLite storage for the server (TTL cache + library), via libsql + Drizzle.
 *
 * libsql *is* SQLite (same file format); its N-API binding loads under plain
 * Node, Bun and Electron-as-Node without ABI rebuilds, which better-sqlite3
 * cannot promise in the packaged desktop app.
 *
 * The database file lives at RESONA_DB_PATH (desktop main.js points it at the
 * OS user-data dir); the default is ./resona.db next to the server. Under
 * `node --test` everything stays in memory unless RESONA_DB_PATH is set
 * explicitly (the storage tests do exactly that).
 *
 * Every failure here degrades to "no database, memory only" — a broken or
 * read-only database location must never take the app down with it.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
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
  db: ReturnType<typeof drizzle>;
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

function open(): Db | null {
  const file = process.env.RESONA_DB_PATH || path.join(process.cwd(), "resona.db");
  let client: Client;
  try {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    client = createClient({ url: "file:" + file });
  } catch (e) {
    console.error("[db] cannot open", file, "— continuing memory-only:", e);
    return null;
  }
  const c: Db = {
    client,
    db: drizzle(client),
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
