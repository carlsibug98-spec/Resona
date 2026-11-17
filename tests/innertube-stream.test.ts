import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The fast resolver path is exercised against the real innertube-stream
 * module with fetch stubbed, so the test asserts our client selection,
 * format picking (audio/mp4 preferred, ciphered skipped) and fail-fast
 * behaviour without hitting the network.
 *
 * v1.7: all clients are raced in parallel — stubs answer per client
 * (identified by the request body's clientName), not per call order.
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

/** parse the stubbed request's clientName out of the POST body */
async function clientNameOf(init?: RequestInit): Promise<string> {
  const body = String(init?.body || "");
  const m = body.match(/"clientName"\s*:\s*"([A-Z0-9_]+)"/);
  return m ? m[1] : "?";
}

test("resolveInnertubeStream picks the highest-bitrate audio/mp4 with a clean url", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  await withFetch(
    (async (_url: string, init?: RequestInit) => {
      // every client answers with the same menu; the winner is the format
      // picker, not the client order
      void (await clientNameOf(init));
      return new Response(
        JSON.stringify(
          playerResponse([
            { mimeType: "audio/webm; codecs=opus", bitrate: 136_000, url: "https://gv/webm" },
            { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 130_000, url: "https://gv/m4a" },
            { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 50_000, url: "https://gv/low" },
            { mimeType: "video/mp4", bitrate: 800_000, url: "https://gv/video" },
          ])
        ),
        { status: 200 }
      );
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r, "should resolve");
      assert.equal(r.url, "https://gv/m4a");
      assert.equal(r.mime, "audio/mp4");
      assert.ok(r.provider.startsWith("innertube:"), `provider was ${r.provider}`);
    }
  );
});

test("resolveInnertubeStream skips ciphered formats and takes a clean client", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  const seen = new Set<string>();
  await withFetch(
    (async (_url: string, init?: RequestInit) => {
      const name = await clientNameOf(init);
      seen.add(name);
      // sdkless ANDROID answers with ciphered-only audio; every other
      // client answers clean — the race must land on a clean one
      if (name === "ANDROID") {
        return new Response(
          JSON.stringify(
            playerResponse([
              { mimeType: "audio/mp4", bitrate: 130_000, signatureCipher: "s=..&url=.." },
            ])
          ),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify(
          playerResponse([{ mimeType: "audio/mp4", bitrate: 128_000, url: "https://gv/clean" }])
        ),
        { status: 200 }
      );
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r);
      assert.equal(r.url, "https://gv/clean");
      assert.notEqual(r.provider, "innertube:android-sdkless");
      assert.ok(seen.size >= 2, `expected several clients raced, saw ${seen.size}`);
    }
  );
});

test("resolveInnertubeStream embed client sends thirdParty.embedUrl context", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  let embedBody: string | null = null;
  await withFetch(
    (async (_url: string, init?: RequestInit) => {
      const body = String(init?.body || "");
      if (body.includes("TVHTML5_SIMPLY_EMBEDDED_PLAYER")) {
        embedBody = body;
        return new Response(
          JSON.stringify(playerResponse([{ mimeType: "audio/mp4", bitrate: 128_000, url: "https://gv/tv" }])),
          { status: 200 }
        );
      }
      // everyone else gated
      return new Response(JSON.stringify(playerResponse([], "LOGIN_REQUIRED")), { status: 200 });
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r, "embed client should win the race");
      assert.equal(r.url, "https://gv/tv");
      assert.ok(embedBody && embedBody.includes("thirdParty"), "embed context must carry thirdParty");
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
      assert.ok(calls >= 2, `all clients raced (${calls} calls)`);
    }
  );
  // all stub calls are instant; the guard here is that we didn't hang
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
