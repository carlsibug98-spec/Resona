import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseBackupText, MAX_BACKUP_BYTES, HISTORY_LIMIT } from "../src/lib/backup-parse.ts";

const track = (over: Record<string, unknown> = {}) => ({
  videoId: "dQw4w9WgXcQ",
  title: "Mahal Magmahal",
  artist: "Esremborak",
  thumb: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg",
  ...over,
});

const v2 = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: "resona-backup",
    version: 2,
    liked: { dQw4w9WgXcQ: { track: track(), likedAt: 1 } },
    playlists: [{ id: "p1", name: "Late night", createdAt: 1, updatedAt: 2, tracks: [track()] }],
    history: [{ track: track(), at: 3 }],
    ...over,
  });

const parse = (text: string, size = text.length) => parseBackupText(text, size);

describe("accepts valid backups", () => {
  test("v2 file parses and counts every section", () => {
    const r = parse(v2());
    assert.deepEqual(r.counts, { liked: 1, playlists: 1, history: 1 });
    assert.equal(r.liked["dQw4w9WgXcQ"].track.title, "Mahal Magmahal");
    assert.equal(r.playlists[0].tracks.length, 1);
    assert.equal(r.history[0].at, 3);
  });

  test("v1 file with a downloads field parses; downloads are ignored", () => {
    const v1 = JSON.stringify({
      exportedFrom: "Resona",
      liked: {},
      playlists: [],
      history: [{ track: track(), at: 1 }],
      downloads: { dQw4w9WgXcQ: { track: track(), complete: true } },
    });
    const r = parse(v1);
    assert.equal(r.counts.history, 1);
    assert.equal(Object.keys(r.liked).length, 0);
  });

  test("liked map is keyed by videoId, not by the object key in the file", () => {
    const text = JSON.stringify({
      liked: { somethingElse: { track: track({ videoId: "abcdefghijk" }), likedAt: 5 } },
    });
    const r = parse(text);
    assert.ok(r.liked["abcdefghijk"]);
    assert.equal(r.liked["somethingElse"], undefined);
  });

  test("missing timestamps fall back to a number, not undefined", () => {
    const r = parse(JSON.stringify({ history: [{ track: track() }] }));
    assert.equal(typeof r.history[0].at, "number");
  });
});

describe("rejects unusable files with a clear message", () => {
  test("file over 2 MB is refused before parsing", () => {
    assert.throws(() => parse(v2(), MAX_BACKUP_BYTES + 1), /over 2 MB/);
  });

  test("invalid JSON", () => {
    assert.throws(() => parse("{not json"), /isn't valid JSON/);
  });

  test("JSON that is not an object", () => {
    for (const text of ["[]", "null", "42", '"hi"']) {
      assert.throws(() => parse(text), /Unrecognized backup format/, text);
    }
  });

  test("valid JSON object with no library data", () => {
    assert.throws(() => parse('{"liked":{},"playlists":[],"history":[]}'), /No Resona library data/);
    assert.throws(() => parse("{}"), /No Resona library data/);
  });

  test("entries with nothing usable are dropped, leaving an empty library, which is rejected", () => {
    const text = JSON.stringify({ liked: { x: { track: { title: "no id" } } } });
    assert.throws(() => parse(text), /No Resona library data/);
  });
});

describe("sanitises hostile or malformed entries", () => {
  test("videoId must be a real 11-character YouTube id", () => {
    const bad = ["", "short", "__proto__", "<script>x", "a".repeat(40), "dQw4w9WgXc!"];
    for (const id of bad) {
      const text = JSON.stringify({ history: [{ track: track({ videoId: id }) }] });
      assert.throws(() => parse(text), /No Resona library data/, id);
    }
  });

  test("a videoId named __proto__ cannot touch the liked map", () => {
    const text = JSON.stringify({
      liked: { x: { track: track({ videoId: "__proto__" }), likedAt: 1 } },
      history: [{ track: track() }],
    });
    const r = parse(text);
    assert.equal(Object.keys(r.liked).length, 0);
    assert.equal(Object.getPrototypeOf(r.liked), null);
  });

  test("a videoId named constructor is stored as data, not as a prototype member", () => {
    const text = JSON.stringify({
      liked: { x: { track: track({ videoId: "constructor" }), likedAt: 1 } },
    });
    const r = parse(text);
    assert.equal(r.liked["constructor"].track.videoId, "constructor");
    assert.equal(Object.getPrototypeOf(r.liked), null);
  });

  test("non-https thumbnails are blanked, not kept", () => {
    const r = parse(JSON.stringify({ history: [{ track: track({ thumb: "http://evil.example/p.gif" }) }] }));
    assert.equal(r.history[0].track.thumb, "");
  });

  test("javascript: and data: thumbnails are blanked", () => {
    for (const thumb of ["javascript:alert(1)", "data:image/png;base64,AAAA"]) {
      const r = parse(JSON.stringify({ history: [{ track: track({ thumb }) }] }));
      assert.equal(r.history[0].track.thumb, "");
    }
  });

  test("unknown fields are stripped", () => {
    const r = parse(JSON.stringify({ history: [{ track: track({ evil: "x", __proto__x: 1 }) }] }));
    assert.equal("evil" in r.history[0].track, false);
  });

  test("overlong title and artist are truncated", () => {
    const r = parse(
      JSON.stringify({ history: [{ track: track({ title: "t".repeat(5000), artist: "a".repeat(5000) }) }] })
    );
    assert.equal(r.history[0].track.title.length, 300);
    assert.equal(r.history[0].track.artist.length, 200);
  });

  test("playlist without a name or id is skipped; duplicate ids keep the first", () => {
    const text = JSON.stringify({
      playlists: [
        { id: "p1", name: "First", tracks: [] },
        { id: "p1", name: "Duplicate", tracks: [] },
        { id: "p2", tracks: [] },
        { name: "No id", tracks: [] },
      ],
    });
    const r = parse(text);
    assert.deepEqual(
      r.playlists.map((p) => p.name),
      ["First"]
    );
  });

  test("invalid tracks inside a playlist are filtered out", () => {
    const text = JSON.stringify({
      playlists: [{ id: "p1", name: "Mix", tracks: [track(), { title: "bad" }, "string"] }],
    });
    assert.equal(parse(text).playlists[0].tracks.length, 1);
  });

  test("history is capped at the limit", () => {
    const history = Array.from({ length: HISTORY_LIMIT + 25 }, (_, i) => ({
      track: track({ videoId: `id${String(i).padStart(9, "0")}` }),
      at: i,
    }));
    const r = parse(JSON.stringify({ history }));
    assert.equal(r.history.length, HISTORY_LIMIT);
    assert.equal(r.counts.history, HISTORY_LIMIT);
  });
});
