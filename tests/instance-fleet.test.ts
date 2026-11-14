import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAudioUrl,
  mergeInstanceLists,
  orderInstances,
  pickBestAudioFormat,
} from "../src/lib/instance-fleet.ts";

test("mergeInstanceLists normalizes, filters and dedupes", () => {
  const merged = mergeInstanceLists(
    ["https://a.example/", "http://b.example", "not-a-url", " https://c.example "],
    ["https://a.example", "https://d.example/"]
  );
  assert.deepEqual(merged, [
    "https://a.example",
    "http://b.example",
    "https://c.example",
    "https://d.example",
  ]);
});

test("mergeInstanceLists keeps user instances first", () => {
  const merged = mergeInstanceLists(["https://mine.example"], ["https://fleet.example"]);
  assert.equal(merged[0], "https://mine.example");
});

test("orderInstances puts the last working instance first", () => {
  const ordered = orderInstances(
    ["https://a.example", "https://b.example", "https://c.example"],
    "https://b.example"
  );
  assert.deepEqual(ordered, [
    "https://b.example",
    "https://a.example",
    "https://c.example",
  ]);
});

test("orderInstances ignores a stale winner that left the list", () => {
  const ordered = orderInstances(["https://a.example"], "https://gone.example");
  assert.deepEqual(ordered, ["https://a.example"]);
});

test("pickBestAudioFormat prefers mp4 over higher-bitrate webm", () => {
  const best = pickBestAudioFormat([
    { itag: 251, type: "audio/webm; codecs=opus", bitrate: 140000 },
    { itag: 140, type: "audio/mp4; codecs=mp4a.40.2", bitrate: 128000 },
  ]);
  assert.equal(best?.itag, 140);
});

test("pickBestAudioFormat falls back to bitrate within one codec", () => {
  const best = pickBestAudioFormat([
    { itag: 249, type: "audio/webm", bitrate: 50000 },
    { itag: 251, type: "audio/webm", bitrate: 140000 },
  ]);
  assert.equal(best?.itag, 251);
});

test("pickBestAudioFormat skips non-audio and useless formats", () => {
  assert.equal(
    pickBestAudioFormat([
      { itag: 137, type: "video/mp4", bitrate: 2000000 },
      { itag: 999, type: "audio/mp4", bitrate: 128000 }, // no url, but has itag — usable
    ])?.itag,
    999
  );
  assert.equal(pickBestAudioFormat([{ type: "video/mp4" }]), null);
  assert.equal(pickBestAudioFormat([]), null);
  assert.equal(pickBestAudioFormat(undefined as unknown as []), null);
});

test("buildAudioUrl uses the instance's local redirect when there is an itag", () => {
  const url = buildAudioUrl("https://inv.example", "dQw4w9WgXcQ", {
    itag: 140,
    type: "audio/mp4",
    bitrate: 128000,
    url: "https://googlevideo.example/videoplayback?whatever",
  });
  assert.equal(
    url,
    "https://inv.example/latest_version?id=dQw4w9WgXcQ&itag=140&local=true"
  );
});

test("buildAudioUrl falls back to the direct url without an itag", () => {
  const url = buildAudioUrl("https://inv.example", "abc", {
    type: "audio/mp4",
    url: "https://direct.example/audio",
  });
  assert.equal(url, "https://direct.example/audio");
});

test("buildAudioUrl returns null when there is nothing usable", () => {
  assert.equal(buildAudioUrl("https://inv.example", "abc", { type: "audio/mp4" }), null);
});
