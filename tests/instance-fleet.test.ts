import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAudioUrl,
  isSafeStreamUrl,
  mergeInstanceLists,
  orderInstances,
  parseInstanceSetting,
  parseInvidiousRegistry,
  firstTruthy,
  parsePipedInstanceDoc,
  pickBestAudioFormat,
  pickPipedAudio,
  DEFAULT_INVIDIOUS,
  DEFAULT_PIPED,
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

test("parseInstanceSetting splits lines and commas, trims and filters", () => {
  assert.deepEqual(
    parseInstanceSetting("https://a.example/\nhttps://b.example, http://c.example\nnope\n"),
    ["https://a.example", "https://b.example", "http://c.example"]
  );
  assert.deepEqual(parseInstanceSetting(""), []);
  assert.deepEqual(parseInstanceSetting(null), []);
  assert.deepEqual(parseInstanceSetting(undefined), []);
});

test("parseInstanceSetting is bounded (max 6, each <= 200 chars)", () => {
  const many = Array.from({ length: 10 }, (_, i) => `https://i${i}.example`).join("\n");
  assert.equal(parseInstanceSetting(many).length, 6);
  const huge = "https://" + "a".repeat(300) + ".example";
  assert.deepEqual(parseInstanceSetting(huge), []);
});

test("isSafeStreamUrl passes real stream hosts", () => {
  assert.equal(isSafeStreamUrl("https://rr3---sn-abc.googlevideo.com/videoplayback?x=1"), true);
  assert.equal(isSafeStreamUrl("https://pipedproxy-example.kavin.rocks/stream?x=1"), true);
  assert.equal(isSafeStreamUrl("https://inv.example/latest_version?id=abc&itag=140&local=true"), true);
});

test("isSafeStreamUrl rejects non-https and internal targets", () => {
  // scheme: the server fetches and relays these bytes — http / data / file
  // URLs from a hostile instance response must never reach the proxy
  assert.equal(isSafeStreamUrl("http://rr3---sn-abc.googlevideo.com/videoplayback"), false);
  assert.equal(isSafeStreamUrl("data:text/html,hi"), false);
  assert.equal(isSafeStreamUrl("file:///etc/passwd"), false);
  // loopback / private / link-local hosts
  assert.equal(isSafeStreamUrl("https://127.0.0.1:9200/"), false);
  assert.equal(isSafeStreamUrl("https://localhost:3000/"), false);
  assert.equal(isSafeStreamUrl("https://10.0.0.5/stream"), false);
  assert.equal(isSafeStreamUrl("https://192.168.1.10/stream"), false);
  assert.equal(isSafeStreamUrl("https://172.20.3.4/stream"), false);
  assert.equal(isSafeStreamUrl("https://169.254.169.254/latest/meta-data"), false);
  assert.equal(isSafeStreamUrl("https://[::1]/stream"), false);
  assert.equal(isSafeStreamUrl("https://[fe80::1]/stream"), false);
  assert.equal(isSafeStreamUrl("https://[fd00::5]/stream"), false);
  // garbage
  assert.equal(isSafeStreamUrl("not a url"), false);
  assert.equal(isSafeStreamUrl(""), false);
});

test("pickPipedAudio takes the highest-bitrate stream with a url", () => {
  const best = pickPipedAudio([
    { itag: 249, mimeType: "audio/webm", bitrate: 50000, url: "https://p.example/249" },
    { itag: 140, mimeType: "audio/mp4", bitrate: 128000, url: "https://p.example/140" },
    { itag: 250, mimeType: "audio/webm", bitrate: 70000 },
  ]);
  assert.equal(best?.itag, 140);
  assert.equal(pickPipedAudio([]), null);
  assert.equal(pickPipedAudio([{ itag: 140 }]), null);
});

test("default fleets are https and non-empty", () => {
  assert.ok(DEFAULT_INVIDIOUS.length >= 3);
  assert.ok(DEFAULT_PIPED.length >= 3);
  for (const u of [...DEFAULT_INVIDIOUS, ...DEFAULT_PIPED]) {
    assert.match(u, /^https:\/\/[a-z0-9.-]+$/i);
  }
});

test("parseInvidiousRegistry keeps https instances only", () => {
  const list = [
    ["inv.example", { type: "https" }],
    ["onion.example", { type: "onion" }],
    ["broken.example", {}],
    ["also-https.example", { type: "https" }],
  ];
  assert.deepEqual(parseInvidiousRegistry(list), [
    "https://inv.example",
    "https://also-https.example",
  ]);
  assert.deepEqual(parseInvidiousRegistry("nope"), []);
  assert.deepEqual(parseInvidiousRegistry(null), []);
});

test("parsePipedInstanceDoc pulls API hosts from the markdown table", () => {
  // real format: name | API URL | location | CDN | users (badge image)
  const doc = [
    "Instance Name | Instance API URL | Instance Location(s) | CDN | Registered Users",
    "--- | --- | --- | --- | ---",
    "kavin.rocks (Official) | https://pipedapi.kavin.rocks | 🇺🇸, 🇮🇳 | Yes | ![](https://pipedapi.kavin.rocks/registered/badge)",
    "adminforge.de | https://pipedapi.adminforge.de | 🇩🇪 | No | ![](https://pipedapi.adminforge.de/registered/badge)",
    "piped.yt | https://api.piped.yt | 🇩🇪 | No | ![](https://api.piped.yt/registered/badge)",
  ].join("\n");
  assert.deepEqual(parsePipedInstanceDoc(doc), [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://api.piped.yt",
  ]);
  // header and separator rows don't parse as URLs; badge URLs in the last
  // column are never picked because only column 2 is read
  assert.deepEqual(parsePipedInstanceDoc(""), []);
  assert.deepEqual(parsePipedInstanceDoc("no table here"), []);
});

test("firstTruthy ignores fast nulls and waits for a real answer", async () => {
  const r = await firstTruthy<string>([
    new Promise((res) => setTimeout(() => res(null), 1)),   // fast failure
    new Promise((res) => setTimeout(() => res(null), 2)),   // second failure
    new Promise((res) => setTimeout(() => res("winner"), 30)), // slow success
  ]);
  assert.equal(r, "winner");
});

test("firstTruthy resolves null when everything settles empty or fails", async () => {
  const r = await firstTruthy<string>([
    Promise.resolve(null),
    Promise.reject(new Error("boom")),
    Promise.resolve(null),
  ]);
  assert.equal(r, null);
  assert.equal(await firstTruthy([]), null);
});
