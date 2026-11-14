import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runDownload, type DownloadDeps } from "../src/lib/download-core.ts";

const track = { videoId: "dQw4w9WgXcQ", title: "Song", artist: "Artist", thumb: "" };

/** Records every call so tests can assert on the sequence of side effects. */
function fakeDeps(over: Partial<DownloadDeps> = {}) {
  const calls: string[] = [];
  const progress: number[] = [];
  const saved: { size: number; mime: string }[] = [];
  let busy = new Set<string>();
  const deps: DownloadDeps = {
    isBusy: (id) => busy.has(id),
    begin: (id) => {
      busy.add(id);
      calls.push("begin");
    },
    progress: (_id, v) => {
      progress.push(v);
    },
    end: (id) => {
      busy.delete(id);
      calls.push("end");
    },
    fetchAudio: async () => new Response(null, { status: 404 }),
    save: async () => {
      calls.push("save");
    },
    markSaved: (_t, size, mime) => {
      saved.push({ size, mime });
      calls.push("markSaved");
    },
    ...over,
  };
  return { deps, calls, progress, saved };
}

/** A response whose body is split into the given chunks. */
function audioResponse(chunks: string[], headers: Record<string, string> = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers });
}

describe("runDownload", () => {
  test("success stores the blob, marks it saved, and reports progress", async () => {
    const { deps, calls, progress, saved } = fakeDeps({
      fetchAudio: async () =>
        audioResponse(["abcd", "efgh"], { "content-length": "8", "content-type": "audio/webm; codecs=opus" }),
    });
    const status = await runDownload(track, deps);
    assert.equal(status, "offline-saved");
    assert.deepEqual(progress, [0.5, 1]);
    assert.deepEqual(saved, [{ size: 8, mime: "audio/webm" }]);
    assert.deepEqual(calls, ["begin", "save", "markSaved", "end"]);
  });

  test("unknown content-length reports indeterminate progress (-1)", async () => {
    const { deps, progress } = fakeDeps({ fetchAudio: async () => audioResponse(["abc"]) });
    await runDownload(track, deps);
    assert.deepEqual(progress, [-1]);
  });

  test("missing content-type falls back to audio/mp4", async () => {
    const { deps, saved } = fakeDeps({ fetchAudio: async () => audioResponse(["abc"]) });
    // Response sets a default text content-type for string bodies; strip it explicitly
    const bare = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("abc"));
          c.close();
        },
      }),
      { status: 200, headers: { "content-type": "" } }
    );
    deps.fetchAudio = async () => bare;
    await runDownload(track, deps);
    assert.equal(saved[0].mime, "audio/mp4");
  });

  test("no direct stream (404) returns stream-only and saves nothing", async () => {
    const { deps, calls, saved } = fakeDeps();
    const status = await runDownload(track, deps);
    assert.equal(status, "stream-only");
    assert.equal(saved.length, 0);
    assert.equal(calls.includes("save"), false);
    assert.equal(calls.includes("markSaved"), false);
  });

  test("an error response that still has a body is stream-only, not saved", async () => {
    // a proxy error page can arrive with a body; it must never be stored as audio
    const { deps, calls, saved } = fakeDeps({
      fetchAudio: async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode("<html>upstream error</html>"));
              c.close();
            },
          }),
          { status: 502 }
        ),
    });
    assert.equal(await runDownload(track, deps), "stream-only");
    assert.equal(saved.length, 0);
    assert.equal(calls.includes("save"), false);
  });

  test("stream-only still clears the in-progress flag", async () => {
    const { deps, calls } = fakeDeps();
    await runDownload(track, deps);
    assert.deepEqual(calls, ["begin", "end"]);
  });

  test("a second download of the same track while busy returns busy and does not fetch", async () => {
    let fetches = 0;
    const { deps } = fakeDeps({
      fetchAudio: async () => {
        fetches++;
        return audioResponse(["x"]);
      },
    });
    const first = runDownload(track, deps);
    const second = await runDownload(track, deps);
    assert.equal(second, "busy");
    await first;
    assert.equal(fetches, 1);
  });

  test("network error returns failed and still clears the in-progress flag", async () => {
    const { deps, calls } = fakeDeps({
      fetchAudio: async () => {
        throw new TypeError("network down");
      },
    });
    assert.equal(await runDownload(track, deps), "failed");
    assert.deepEqual(calls, ["begin", "end"]);
  });

  test("stream that dies mid-download returns failed and saves nothing", async () => {
    const { deps, calls } = fakeDeps({
      fetchAudio: async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode("half"));
              c.error(new Error("connection reset"));
            },
          }),
          { status: 200, headers: { "content-length": "100" } }
        ),
    });
    assert.equal(await runDownload(track, deps), "failed");
    assert.equal(calls.includes("save"), false);
    assert.equal(calls.includes("markSaved"), false);
    assert.equal(calls.at(-1), "end");
  });

  test("storage failure returns failed and does not mark the track saved", async () => {
    const { deps, calls } = fakeDeps({
      fetchAudio: async () => audioResponse(["abc"]),
      save: async () => {
        throw new Error("QuotaExceededError");
      },
    });
    assert.equal(await runDownload(track, deps), "failed");
    assert.equal(calls.includes("markSaved"), false);
    assert.equal(calls.at(-1), "end");
  });
});
