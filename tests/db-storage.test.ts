/**
 * SQLite persistence tests. These run against a real database file in a
 * temp dir (RESONA_DB_PATH is the switch that lets node --test touch the
 * filesystem), and — for the cache — across two separate module instances,
 * which is the closest a unit test gets to "server restart".
 *
 * The rest of the suite stays memory-only: dbEnabled() keeps every other
 * test from creating resona.db files next to the repo.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "resona-db-"));
process.env.RESONA_DB_PATH = path.join(tmp, "resona.db");

// import AFTER the env var is set — db.ts reads it lazily but keep it obvious
const { dbReady, getDb } = await import("../src/lib/server/db.ts");
const { cacheSet, cacheGet } = await import("../src/lib/server/cache.ts");
const {
  putLike,
  deleteLike,
  putPlaylist,
  deletePlaylist,
  pushHistory,
  getLibrary,
  replaceLibrary,
} = await import("../src/lib/server/library-store.ts");

const track = (id: string, title = id) => ({
  videoId: id.padEnd(11, "x"),
  title,
  artist: "Test Artist",
  thumb: "https://i.ytimg.com/vi/x/hq.jpg",
});

describe("sqlite storage", () => {
  before(async () => {
    const c = await dbReady();
    assert.ok(c, "database should be available with RESONA_DB_PATH set");
  });

  test("schema creates all tables", async () => {
    const c = await dbReady();
    const rs = await c!.client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = rs.rows.map((r) => String(r.name));
    for (const t of ["kv", "likes", "playlists", "playlist_tracks", "history"])
      assert.ok(names.includes(t), `table ${t} should exist`);
  });

  test("library rows round-trip through the store", async () => {
    await putLike(track("aaaa"), 1000);
    await putLike(track("bbbb"), 2000);
    await putPlaylist({
      id: "pl1",
      name: "Test mix",
      createdAt: 1,
      updatedAt: 2,
      tracks: [track("cccc"), track("dddd")],
    });
    await pushHistory(track("eeee"), 3000);
    await pushHistory(track("aaaa"), 4000);

    const snap = await getLibrary();
    assert.equal(Object.keys(snap.liked).length, 2);
    assert.equal(snap.playlists.length, 1);
    assert.equal(snap.playlists[0].tracks.length, 2);
    assert.equal(snap.history.length, 2);
    assert.equal(snap.history[0].track.videoId, track("aaaa").videoId, "history is newest-first");
  });

  test("unlike and playlist delete remove rows", async () => {
    await deleteLike(track("bbbb").videoId);
    await deletePlaylist("pl1");
    const snap = await getLibrary();
    assert.equal(Object.keys(snap.liked).length, 1);
    assert.equal(snap.playlists.length, 0);
  });

  test("replaceLibrary swaps the whole library", async () => {
    await replaceLibrary({
      liked: { [track("zzzz").videoId]: { track: track("zzzz"), likedAt: 9 } },
      playlists: [],
      history: [{ track: track("zzzz"), at: 9 }],
    });
    const snap = await getLibrary();
    assert.equal(Object.keys(snap.liked).length, 1);
    assert.deepEqual(Object.keys(snap.liked), [track("zzzz").videoId]);
    assert.equal(snap.history.length, 1);
  });

  test("kv cache persists and expires", async () => {
    cacheSet("test:persistent", { hello: "world" }, 60_000);
    const hit = cacheGet<{ hello: string }>("test:persistent");
    assert.deepEqual(hit, { hello: "world" });

    // expiry is enforced on read, exactly like the old Map
    cacheSet("test:short", 1, 1);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(cacheGet("test:short"), null);
  });

  test("a fresh module instance sees what the first one wrote (restart)", async () => {
    // simulate a server restart: re-import the cache module with the same
    // database file. Node caches modules per URL; a query-string busts it.
    const bust = `?restart=${Date.now()}`;
    const fresh = await import(`../src/lib/server/cache.ts${bust}`);
    // priming is lazy — a first read kicks it off, then poll until the
    // background load from SQLite lands (or the test times out)
    fresh.cacheGet("__prime__");
    let hit: { hello: string } | null = null;
    for (let i = 0; i < 40 && hit === null; i++) {
      await new Promise((r) => setTimeout(r, 50));
      hit = fresh.cacheGet<{ hello: string }>("test:persistent");
    }
    assert.deepEqual(hit, { hello: "world" }, "cache row survives a restart");
  });

  after(() => {
    // drop the connection so the temp dir can be cleaned (WAL files etc.)
    const c = getDb();
    try {
      c?.client.close();
    } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
