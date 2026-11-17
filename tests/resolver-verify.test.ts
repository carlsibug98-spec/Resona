import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The v1.7.2 resolver contract: a URL is only returned (and cached as a
 * hit) after a 1-byte range probe proves it serves bytes. The regression
 * this guards: v1.7.0/1.7.1 races let the first *answered* provider win
 * even when its URL 403s on fetch — dead URLs got cached 30 minutes as
 * "hits" and tracks went silent until the cache expired.
 *
 * fetch is stubbed with a router that models the real world:
 *  - the InnerTube player endpoint is bot-gated (LOGIN_REQUIRED)
 *  - discovery endpoints are unreachable
 *  - one Piped instance answers FAST but hands out a dead URL (403)
 *  - another answers slower with a live URL (206 on range probe)
 *
 * Every fetch returns a FRESH Response — a Response body can only be
 * consumed once, and the fleet probes the same URL from several racers.
 */

type FetchImpl = typeof fetch;

function withFetch(stub: FetchImpl, fn: () => Promise<void>): Promise<void> {
  const prev = globalThis.fetch;
  globalThis.fetch = stub as FetchImpl;
  return fn().finally(() => {
    globalThis.fetch = prev;
  });
}

/** JSON Response helper with explicit status */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function pipedStreams(url: string, bitrate = 128_000) {
  return json({ audioStreams: [{ url, mimeType: "audio/mp4", bitrate }] });
}

test("verifyAudioUrl accepts 206 range answers", async () => {
  const { verifyAudioUrl } = await import("../src/lib/server/cache.ts");
  await withFetch(
    (async () => new Response("x", { status: 206 })) as FetchImpl,
    async () => {
      assert.equal(await verifyAudioUrl("https://gv/audio"), true);
    }
  );
});

test("verifyAudioUrl accepts a 200 that ignores Range, cancelling the body", async () => {
  const { verifyAudioUrl } = await import("../src/lib/server/cache.ts");
  let cancelled = false;
  await withFetch(
    (async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(1024));
          // never close: a real full-file download would run to EOF
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(stream, { status: 200 });
    }) as FetchImpl,
    async () => {
      assert.equal(await verifyAudioUrl("https://gv/audio"), true);
      // give the cancel a tick to land
      await new Promise((r) => setTimeout(r, 10));
      assert.ok(cancelled, "body must be cancelled so the probe never downloads the file");
    }
  );
});

test("verifyAudioUrl rejects 403 (dead/gated googlevideo)", async () => {
  const { verifyAudioUrl } = await import("../src/lib/server/cache.ts");
  await withFetch(
    (async () => new Response("forbidden", { status: 403 })) as FetchImpl,
    async () => {
      assert.equal(await verifyAudioUrl("https://gv/audio"), false);
    }
  );
});

test("verifyAudioUrl rejects a network error", async () => {
  const { verifyAudioUrl } = await import("../src/lib/server/cache.ts");
  await withFetch(
    (async () => {
      throw new Error("network down");
    }) as FetchImpl,
    async () => {
      assert.equal(await verifyAudioUrl("https://gv/audio"), false);
    }
  );
});

test("resolveStream never returns a dead URL that answered first — and caches only the live one", async () => {
  const { resolveStream } = await import("../src/lib/server/resolver.ts");
  const videoId = "vrf1x2y3z4a";

  let liveProbes = 0;

  await withFetch(
    (async (url: string | URL | Request) => {
      const u = String(url);
      // InnerTube: bot-gated on this network
      if (u.includes("youtube.com/youtubei"))
        return json({ playabilityStatus: { status: "LOGIN_REQUIRED" } });
      // instance discovery: unreachable
      if (u.includes("api.invidious.io") || u.includes("raw.githubusercontent.com"))
        return new Response("nope", { status: 404 });
      // the fast-but-dead instance: API answers instantly, URL 403s
      if (u.startsWith("https://pipedapi.adminforge.de/streams/"))
        return pipedStreams("https://dead.example/audio");
      // the healthy instance: API answers with a small delay, URL serves
      if (u.startsWith("https://api.piped.private.coffee/streams/")) {
        await new Promise((r) => setTimeout(r, 25));
        return pipedStreams("https://live.example/audio");
      }
      if (u === "https://dead.example/audio")
        return new Response("forbidden", { status: 403 });
      if (u === "https://live.example/audio") {
        liveProbes++;
        return new Response("x", { status: 206 });
      }
      // every other fleet instance: unreachable
      return new Response("nope", { status: 404 });
    }) as FetchImpl,
    async () => {
      const r = await resolveStream(videoId, null, { ytdlp: false, fresh: true });
      assert.ok(r.url, "should resolve");
      assert.equal(r.url, "https://live.example/audio");
      assert.ok(
        r.provider?.startsWith("piped:api.piped.private.coffee"),
        `provider was ${r.provider}`
      );
      assert.equal(r.proxied, true);
      assert.ok(liveProbes >= 1, "the returned URL must have been range-probed");

      // the cached hit must be the live URL, not the dead one
      const again = await resolveStream(videoId, null, { ytdlp: false });
      assert.equal(again.url, "https://live.example/audio");
    }
  );
});

test("resolveStream returns url:null (not a dead URL) when every provider's URLs are dead", async () => {
  const { resolveStream } = await import("../src/lib/server/resolver.ts");
  const videoId = "vrf2x3y4z5b";

  await withFetch(
    (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("youtube.com/youtubei"))
        return json({ playabilityStatus: { status: "LOGIN_REQUIRED" } });
      if (u.includes("api.invidious.io") || u.includes("raw.githubusercontent.com"))
        return new Response("nope", { status: 404 });
      // every Piped API answers… with URLs that all 403
      if (u.includes("/streams/")) return pipedStreams("https://dead.example/audio");
      if (u === "https://dead.example/audio")
        return new Response("forbidden", { status: 403 });
      return new Response("nope", { status: 404 });
    }) as FetchImpl,
    async () => {
      const r = await resolveStream(videoId, null, { ytdlp: false, fresh: true });
      assert.equal(r.url, null, "a dead URL must never be handed out");
      assert.equal(r.provider, null);
    }
  );
});

test("v1.7.3: InnerTube results are marked proxied and carry the minting UA", async () => {
  const { resolveStream } = await import("../src/lib/server/resolver.ts");
  const videoId = "uaIdentity01";
  await withFetch(
    (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("youtube.com/youtubei"))
        return json({
          playabilityStatus: { status: "OK" },
          streamingData: {
            adaptiveFormats: [
              { mimeType: "audio/mp4", bitrate: 130_000, url: "https://gv/audio" },
            ],
          },
        });
      if (u.includes("api.invidious.io") || u.includes("raw.githubusercontent.com"))
        return new Response("nope", { status: 404 });
      if (u === "https://gv/audio") return new Response("x", { status: 206 });
      return new Response("nope", { status: 404 });
    }) as FetchImpl,
    async () => {
      const r = await resolveStream(videoId, null, { ytdlp: false, fresh: true });
      assert.ok(r.url, "should resolve via InnerTube");
      assert.equal(r.proxied, true, "app-client URLs must play through the byte proxy");
      assert.ok(r.ua && r.ua.includes("android"), `must carry the minting UA, got ${r.ua}`);
      // and the proxy route presents that UA upstream (route-level test
      // stubs are impractical here; the contract is documented in code)
    }
  );
});
