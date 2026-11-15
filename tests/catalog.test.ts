import { test } from "node:test";
import assert from "node:assert/strict";
import { hueFor, isMusicEntry } from "../src/lib/catalog-utils.ts";

test("hueFor is stable and in range", () => {
  assert.equal(hueFor("The Weeknd"), hueFor("The Weeknd"));
  assert.equal(hueFor("ENHYPEN"), hueFor("ENHYPEN"));
  for (const name of ["A", "The Weeknd", "Karol G", "林家謙", "artist with a very long name"]) {
    const h = hueFor(name);
    assert.ok(h >= 0 && h < 360, `${name} -> ${h} out of range`);
  }
});

test("hueFor differs across names (spread)", () => {
  const hues = new Set(["ENHYPEN", "The Weeknd", "IDK", "Shubh", "Becky G"].map(hueFor));
  assert.ok(hues.size >= 4, `expected spread, got ${[...hues].join(",")}`);
});

test("isMusicEntry keeps real releases", () => {
  assert.ok(isMusicEntry("Paranormal", "ENHYPEN"));
  assert.ok(isMusicEntry("Hong Kong (feat. 王菲季候風)", "The Weeknd"));
  assert.ok(isMusicEntry("UP (Official MV)", "ATEEZ"));
});

test("isMusicEntry filters junk chart rows and unknown artists", () => {
  assert.ok(!isMusicEntry("O.M - Trailer | Dhanush", "Divo Music"));
  assert.ok(!isMusicEntry("#D55 Title Announcement Tomorrow", "Divo Music"));
  assert.ok(!isMusicEntry("Top Christmas Songs of All Time Playlist", "Christmas Melodies"));
  assert.ok(!isMusicEntry("Best of 2026 Mix", "Someone"));
  assert.ok(!isMusicEntry("Some Song (Live)", "Unknown artist"));
});
