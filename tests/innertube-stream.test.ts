import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The fast resolver path is exercised against the real innertube-stream
 * module with fetch stubbed, so the test asserts our client selection,
 * format picking (audio/mp4 preferred, ciphered skipped) and fail-fast
 * behaviour without hitting the network.
 */

type FetchImpl = typeof fetch;

const REAL_FETCH: FetchImpl = globalThis.fetch;

function withFetch(stub: FetchImpl, fn: () => Promise<void>): Promise<void> {
  const prev = globalThis.fetch;
  globalThis.fetch = stub as FetchImpl;
  return fn().finally(() => {
    globalThis.fetch = prev;
  });
}

function playerResponse(fmts: unknown[], status = "OK") {
  return {
    playabilityStatus: { status },
    streamingData: { adaptiveFormats: fmts },
  };
}

test("resolveInnertubeStream picks the highest-bitrate audio/mp4 with a clean url", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  await withFetch(
    (async () =>
      new Response(JSON.stringify(playerResponse([
        { mimeType: "audio/webm; codecs=opus", bitrate: 136_000, url: "https://gv/webm" },
        { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 130_000, url: "https://gv/m4a" },
        { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 50_000, url: "https://gv/low" },
        { mimeType: "video/mp4", bitrate: 800_000, url: "https://gv/video" },
      ])), { status: 200 })) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r, "should resolve");
      assert.equal(r.url, "https://gv/m4a");
      assert.equal(r.mime, "audio/mp4");
      assert.equal(r.provider, "innertube:android-sdkless");
    }
  );
});

test("resolveInnertubeStream skips ciphered formats and falls to the next client", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  let calls = 0;
  await withFetch(
    (async () => {
      calls++;
      // first client (android-sdkless): only ciphered audio
      if (calls === 1)
        return new Response(
          JSON.stringify(
            playerResponse([
              { mimeType: "audio/mp4", bitrate: 130_000, signatureCipher: "s=..&url=.." },
            ])
          ),
          { status: 200 }
        );
      // second client (android-music): clean
      return new Response(
        JSON.stringify(
          playerResponse([{ mimeType: "audio/mp4", bitrate: 128_000, url: "https://gv/music" }])
        ),
        { status: 200 }
      );
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r);
      assert.equal(r.url, "https://gv/music");
      assert.equal(r.provider, "innertube:android-music");
      assert.equal(calls, 2);
    }
  );
});

test("resolveInnertubeStream returns null fast on bot-gated LOGIN_REQUIRED", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  let calls = 0;
  const t0 = Date.now();
  await withFetch(
    (async () => {
      calls++;
      return new Response(
        JSON.stringify(playerResponse([], "LOGIN_REQUIRED")),
        { status: 200 }
      );
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.equal(r, null);
      assert.equal(calls, 2, "both clients tried");
    }
  );
  // both stub calls are instant; the guard here is that we didn't hang
  assert.ok(Date.now() - t0 < 2000, "fail-fast, no long waits");
});

test("resolveInnertubeStream survives a thrown fetch (network error)", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  await withFetch(
    (async () => {
      throw new Error("network down");
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.equal(r, null);
    }
  );
  void REAL_FETCH;
});
