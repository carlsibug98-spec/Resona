import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyBackup, mergeHistory, mergeLiked, mergePlaylists } from "../src/lib/backup-merge.ts";
const HISTORY_LIMIT = 60;

const t = (id: string, title = id) => ({
  videoId: id.padEnd(11, "x"),
  title,
  artist: "A",
  thumb: "",
});
const liked = (pairs: [string, number][]) => {
  const m: Record<string, { track: ReturnType<typeof t>; likedAt: number }> = Object.create(null);
  for (const [id, at] of pairs) m[t(id).videoId] = { track: t(id), likedAt: at };
  return m;
};
const pl = (id: string, tracks: string[], updatedAt = 1, name = id) => ({
  id,
  name,
  createdAt: 1,
  updatedAt,
  tracks: tracks.map((x) => t(x)),
});
const hist = (pairs: [string, number][]) => pairs.map(([id, at]) => ({ track: t(id), at }));

describe("mergeLiked", () => {
  test("union of both sides", () => {
    const r = mergeLiked(liked([["a", 1]]), liked([["b", 2]]));
    assert.deepEqual(Object.keys(r).sort(), [t("a").videoId, t("b").videoId].sort());
  });

  test("the later like time wins for a song in both", () => {
    const r = mergeLiked(liked([["a", 5]]), liked([["a", 9]]));
    assert.equal(r[t("a").videoId].likedAt, 9);
    const r2 = mergeLiked(liked([["a", 9]]), liked([["a", 5]]));
    assert.equal(r2[t("a").videoId].likedAt, 9);
  });

  test("result has no prototype, so a key can't collide with Object members", () => {
    assert.equal(Object.getPrototypeOf(mergeLiked(liked([]), liked([]))), null);
  });
});

describe("mergePlaylists", () => {
  test("playlists with new ids are added", () => {
    const r = mergePlaylists([pl("p1", ["a"])], [pl("p2", ["b"])]);
    assert.deepEqual(r.map((p) => p.id), ["p1", "p2"]);
  });

  test("matching ids get only the tracks they don't already have", () => {
    const r = mergePlaylists([pl("p1", ["a", "b"])], [pl("p1", ["b", "c"])]);
    assert.deepEqual(
      r[0].tracks.map((x) => x.videoId),
      [t("a").videoId, t("b").videoId, t("c").videoId]
    );
  });

  test("keeps the current name and the latest updatedAt", () => {
    const r = mergePlaylists([pl("p1", [], 5, "Mine")], [pl("p1", [], 9, "Theirs")]);
    assert.equal(r[0].name, "Mine");
    assert.equal(r[0].updatedAt, 9);
  });

  test("duplicate tracks inside the file are collapsed", () => {
    const r = mergePlaylists([], [pl("p1", ["a", "a", "b"])]);
    assert.equal(r[0].tracks.length, 2);
  });
});

describe("mergeHistory", () => {
  test("one entry per track, keeping the latest play", () => {
    const r = mergeHistory(hist([["a", 10]]), hist([["a", 20], ["b", 5]]), HISTORY_LIMIT);
    assert.equal(r.length, 2);
    assert.equal(r.find((h) => h.track.videoId === t("a").videoId)?.at, 20);
  });

  test("sorted most recent first", () => {
    const r = mergeHistory(hist([["a", 1]]), hist([["b", 3], ["c", 2]]), HISTORY_LIMIT);
    assert.deepEqual(r.map((h) => h.at), [3, 2, 1]);
  });

  test("capped at the history limit", () => {
    const many = Array.from({ length: HISTORY_LIMIT + 10 }, (_, i) => ({
      track: t(`id${String(i).padStart(9, "0")}`),
      at: i,
    }));
    assert.equal(mergeHistory(many, [], HISTORY_LIMIT).length, HISTORY_LIMIT);
  });
});

describe("applyBackup", () => {
  const current = {
    liked: liked([["keep", 1]]),
    playlists: [pl("p1", ["mine"], 1, "Mine")],
    history: hist([["mine", 1]]),
  };
  const incoming = {
    liked: liked([["new", 2]]),
    playlists: [pl("p2", ["theirs"], 1, "Theirs")],
    history: hist([["theirs", 2]]),
  };

  test("merge keeps this device's data and adds the file's", () => {
    const r = applyBackup(current, incoming, ["liked", "playlists", "history"], "merge", HISTORY_LIMIT);
    assert.equal(Object.keys(r.liked).length, 2);
    assert.deepEqual(r.playlists.map((p) => p.id), ["p1", "p2"]);
    assert.equal(r.history.length, 2);
  });

  test("replace discards this device's data in the selected sections", () => {
    const r = applyBackup(current, incoming, ["liked", "playlists", "history"], "replace", HISTORY_LIMIT);
    assert.deepEqual(Object.keys(r.liked), [t("new").videoId]);
    assert.deepEqual(r.playlists.map((p) => p.id), ["p2"]);
    assert.deepEqual(r.history.map((h) => h.track.videoId), [t("theirs").videoId]);
  });

  test("unselected sections are left exactly as they were, in both modes", () => {
    for (const mode of ["merge", "replace"] as const) {
      const r = applyBackup(current, incoming, ["liked"], mode, HISTORY_LIMIT);
      assert.equal(r.playlists, current.playlists, mode);
      assert.equal(r.history, current.history, mode);
    }
  });

  test("no sections selected changes nothing", () => {
    const r = applyBackup(current, incoming, [], "replace", HISTORY_LIMIT);
    assert.equal(r.liked, current.liked);
    assert.equal(r.playlists, current.playlists);
    assert.equal(r.history, current.history);
  });

  test("replace only touches the sections it was given", () => {
    const r = applyBackup(current, incoming, ["history"], "replace", HISTORY_LIMIT);
    assert.equal(Object.keys(r.liked).length, 1);
    assert.equal(r.liked[t("keep").videoId] !== undefined, true);
    assert.equal(r.history[0].track.videoId, t("theirs").videoId);
  });
});
