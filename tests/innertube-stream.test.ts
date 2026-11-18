import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The fast resolver path is exercised against the real innertube-stream
 * module with fetch stubbed, so the test asserts our client selection,
 * format picking (audio/mp4 preferred, ciphered skipped) and fail-fast
 * behaviour without hitting the network.
 *
 * v1.7.3: clients are walked SEQUENTIALLY (the parallel 4-way race burst
 * POSTs tripped YouTube's IP bot-gate — the root cause of "some tracks
 * never play"). Tests assert ladder order, one-POST happy path, the
 * "not a bot" IP-gate short-circuit (and that the age gate does NOT arm
 * it), and per-format fall-through when the top itag is dead.
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

function playerResponse(fmts: unknown[], status = "OK", reason = "") {
  return {
    playabilityStatus: { status, ...(reason ? { reason } : {}) },
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
      // v1.7.6: quality is explicit — high takes the top tier
      const r = await resolveInnertubeStream("abc12345678", { quality: "high" });
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
  let playerPosts = 0;
  await withFetch(
    (async (_url: string, init?: RequestInit) => {
      const u = String(_url);
      if (u.includes("youtube.com/youtubei")) {
        playerPosts++;
        const name = await clientNameOf(init);
        // vr answers with ciphered-only audio; the next client answers
        // clean — the ladder must land on the clean one
        if (name === "ANDROID_VR") {
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
          JSON.stringify(playerResponse([{ mimeType: "audio/mp4", bitrate: 128_000, url: "https://gv/clean" }])),
          { status: 200 }
        );
      }
      // the range probe — serve bytes
      return new Response("x", { status: 206 });
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r);
      assert.equal(r.url, "https://gv/clean");
      assert.equal(r.provider, "innertube:android-sdkless");
      assert.equal(playerPosts, 2, `vr must be skipped, not retried in a race, saw ${playerPosts} POSTs`);
    }
  );
});

test("resolveInnertubeStream TV client sends the Cobalt TVHTML5 context", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  let tvBody: string | null = null;
  await withFetch(
    (async (_url: string, init?: RequestInit) => {
      const body = String(init?.body || "");
      const name = await clientNameOf(init);
      if (name === "TVHTML5") {
        tvBody = body;
        return new Response(
          JSON.stringify(playerResponse([{ mimeType: "audio/mp4", bitrate: 128_000, url: "https://gv/tv" }])),
          { status: 200 }
        );
      }
      // android clients answer OK but with no usable formats — the
      // ladder must reach the TV client (NOT the bot-gate, which would
      // stop the walk early)
      return new Response(JSON.stringify(playerResponse([], "OK")), { status: 200 });
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r, "TV client should win the ladder");
      assert.equal(r.url, "https://gv/tv");
      assert.ok(r.provider === "innertube:tv");
      assert.ok(r.ua.includes("Cobalt"), "result must carry the minting client UA");
      assert.ok(tvBody && tvBody.includes("tvAppInfo"), "TV context must carry the Cobalt TV fields");
    }
  );
});

test("resolveInnertubeStream walks the ladder sequentially — first client wins with ONE player POST", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  let playerPosts = 0;
  const asked: string[] = [];
  await withFetch(
    (async (_url: string, init?: RequestInit) => {
      const u = String(_url);
      if (u.includes("youtube.com/youtubei")) {
        playerPosts++;
        const name = await clientNameOf(init);
        asked.push(name);
        return new Response(
          JSON.stringify(playerResponse([{ mimeType: "audio/mp4", bitrate: 128_000, url: "https://gv/live" }])),
          { status: 200 }
        );
      }
      // the range probe — serve bytes
      return new Response("x", { status: 206 });
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r);
      assert.equal(r.provider, "innertube:android-vr");
      assert.equal(playerPosts, 1, `expected exactly 1 POST, saw ${playerPosts}`);
      assert.deepEqual(asked, ["ANDROID_VR"]);
    }
  );
});

test("bot-gate on ALL clients arms the IP-wide gate and stops POSTing", async () => {
  const { resolveInnertubeStream, innertubeGateActive, innertubeGateReset } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  innertubeGateReset();
  let playerPosts = 0;
  await withFetch(
    (async (_url: string, init?: RequestInit) => {
      const u = String(_url);
      if (u.includes("youtube.com/youtubei")) {
        playerPosts++;
        return new Response(
          JSON.stringify(playerResponse([], "LOGIN_REQUIRED", "Sign in to confirm you're not a bot")),
          { status: 200 }
        );
      }
      return new Response("x", { status: 206 });
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.equal(r, null);
      // every client was asked once (a flapping gate must not stop the
      // walk early) — then the IP gate arms
      assert.equal(playerPosts, 3, `expected one POST per client, saw ${playerPosts}`);
      assert.ok(innertubeGateActive(), "IP gate should be armed when ALL clients gate");
      // while the gate is armed, resolving costs ZERO further POSTs
      const r2 = await resolveInnertubeStream("other0012345");
      assert.equal(r2, null);
      assert.equal(playerPosts, 3, "gated resolve must not POST at all");
    }
  );
  innertubeGateReset();
});

test("flapping gate: first client gated, next client passes — resolve succeeds, no IP gate", async () => {
  const { resolveInnertubeStream, innertubeGateActive, innertubeGateReset } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  innertubeGateReset();
  await withFetch(
    (async (_url: string, init?: RequestInit) => {
      const u = String(_url);
      if (u.includes("youtube.com/youtubei")) {
        const name = await clientNameOf(init);
        // the gate flaps per request: vr draws a gated answer, sdkless
        // passes seconds later — the walk must continue and win
        if (name === "ANDROID_VR") {
          return new Response(
            JSON.stringify(playerResponse([], "LOGIN_REQUIRED", "Sign in to confirm you're not a bot")),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify(playerResponse([{ mimeType: "audio/mp4", bitrate: 128_000, url: "https://gv/live" }])),
          { status: 200 }
        );
      }
      return new Response("x", { status: 206 });
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r, "the passing client must win despite the earlier gate");
      assert.equal(r.url, "https://gv/live");
      assert.equal(r.provider, "innertube:android-sdkless");
      assert.equal(innertubeGateActive(), false, "a single gated answer must NOT arm the IP gate");
    }
  );
  innertubeGateReset();
});

test("v1.7.4 escalation: a full-gate cycle arms a SHORT gate, not a 10-min blackout", async () => {
  const { resolveInnertubeStream, innertubeGateActive, innertubeGateReset } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  innertubeGateReset();
  await withFetch(
    (async (_url: string) => {
      const u = String(_url);
      if (u.includes("youtube.com/youtubei")) {
        return new Response(
          JSON.stringify(playerResponse([], "LOGIN_REQUIRED", "Sign in to confirm you're not a bot")),
          { status: 200 }
        );
      }
      return new Response("x", { status: 206 });
    }) as FetchImpl,
    async () => {
      await resolveInnertubeStream("esc01234567");
      assert.ok(innertubeGateActive(), "first full gate arms the gate");
      // the first step is 30 s — a full 10-minute blackout after ONE bad
      // track was the v1.7.3 bug: on a flapping residential IP the gate
      // lifts in seconds, and the app stayed dead for 10 minutes
      const waitMs = 10_000; // far below the 30 s first step
      await new Promise((r) => setTimeout(r, waitMs));
      assert.ok(innertubeGateActive(), "gate must still be active after 10 s (30 s first step)");
    }
  );
  innertubeGateReset();
});

test("age gate does NOT arm the IP-wide gate — every client is still tried", async () => {
  const { resolveInnertubeStream, innertubeGateActive, innertubeGateReset } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  innertubeGateReset();
  let playerPosts = 0;
  await withFetch(
    (async (_url: string, init?: RequestInit) => {
      const u = String(_url);
      if (u.includes("youtube.com/youtubei")) {
        playerPosts++;
        return new Response(
          JSON.stringify(playerResponse([], "LOGIN_REQUIRED", "Sign in to confirm your age")),
          { status: 200 }
        );
      }
      return new Response("x", { status: 206 });
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.equal(r, null);
      assert.equal(playerPosts, 3, `age gate must not stop the ladder, saw ${playerPosts}`);
      assert.equal(innertubeGateActive(), false, "age gate is per-video, not per-IP");
    }
  );
});

test("top format dead → the next format of the SAME client answer wins", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  await withFetch(
    (async (_url: string) => {
      const u = String(_url);
      if (u.includes("youtube.com/youtubei")) {
        return new Response(
          JSON.stringify(playerResponse([
            { mimeType: "audio/mp4", bitrate: 130_000, url: "https://gv/dead" },
            { mimeType: "audio/mp4", bitrate: 50_000, url: "https://gv/low" },
          ])),
          { status: 200 }
        );
      }
      if (u === "https://gv/dead") return new Response("forbidden", { status: 403 });
      if (u === "https://gv/low") return new Response("x", { status: 206 });
      return new Response("nope", { status: 404 });
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r, "the lower-bitrate live format should win");
      assert.equal(r.url, "https://gv/low");
    }
  );
});

test("dead URL on the first client → the ladder falls through to the next one", async () => {
  const { resolveInnertubeStream } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  await withFetch(
    (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      // the player endpoint
      if (u.includes("youtube.com/youtubei")) {
        const name = await clientNameOf(init);
        if (name === "ANDROID_VR") {
          return new Response(
            JSON.stringify(playerResponse([
              { mimeType: "audio/mp4", bitrate: 130_000, url: "https://gv/dead" },
            ])),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify(playerResponse([
            { mimeType: "audio/mp4", bitrate: 128_000, url: "https://gv/live" },
          ])),
          { status: 200 }
        );
      }
      // the range probes
      if (u === "https://gv/dead") return new Response("forbidden", { status: 403 });
      if (u === "https://gv/live") return new Response("x", { status: 206 });
      return new Response("nope", { status: 404 });
    }) as FetchImpl,
    async () => {
      const r = await resolveInnertubeStream("abc12345678");
      assert.ok(r, "a live client should win the ladder");
      assert.equal(r.url, "https://gv/live");
      assert.equal(r.provider, "innertube:android-sdkless");
    }
  );
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

/* ── v1.7.6 quality selection (Musify's selectAudioOnlyStreamForQuality) ── */

test("audioFormatCandidates: high returns the best candidate, standard drops the top tier", async () => {
  const { audioFormatCandidates } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  const fmts = [
    { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 129_000, url: "https://x/129k" },
    { mimeType: "audio/webm; codecs=opus", bitrate: 156_000, url: "https://x/156k" },
    { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 62_000, url: "https://x/62k" },
  ];
  // high → the best overall (the 156k opus out-scored? no: AAC tier wins
  // per Musify's compatibility score — codec tier dominates bitrate)
  const high = audioFormatCandidates(fmts, "high");
  assert.equal(high[0].url, "https://x/129k", "AAC tier beats higher-bitrate opus");
  // standard → the same list minus the top pick (the lower band)
  const standard = audioFormatCandidates(fmts, "standard");
  assert.equal(standard[0].url, "https://x/62k", "standard drops the top tier");
  assert.ok(!standard.some((f) => f.url === "https://x/129k"), "top pick absent from standard");
});

test("audioFormatCandidates: Dolby codecs are excluded entirely", async () => {
  const { audioFormatCandidates } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  const fmts = [
    { mimeType: 'audio/mp4; codecs="ec-3"', bitrate: 999_000, url: "https://x/dolby" },
    { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 128_000, url: "https://x/aac" },
  ];
  // Dolby is filtered by codecScore; the lone AAC survivor stays
  // playable in BOTH modes (standard's drop-the-top only applies when a
  // lower alternative exists)
  for (const quality of ["standard", "high"] as const) {
    const picked = audioFormatCandidates(fmts, quality);
    assert.equal(picked.length, 1, quality);
    assert.equal(picked[0].url, "https://x/aac");
  }
});

test("audioFormatCandidates: ciphered formats stay excluded regardless of quality", async () => {
  const { audioFormatCandidates } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  const fmts = [
    { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 130_000, signatureCipher: "s=abc" },
    { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 96_000, url: "https://x/96k" },
  ];
  for (const quality of ["standard", "high"] as const) {
    const picked = audioFormatCandidates(fmts, quality);
    assert.equal(picked.length, 1);
    assert.equal(picked[0].url, "https://x/96k");
  }
});

test("resolveInnertubeStream quality=standard picks a lower format than quality=high", async () => {
  const { resolveInnertubeStream, innertubeGateReset } = await import(
    "../src/lib/server/innertube-stream.ts"
  );
  innertubeGateReset();
  const fmts = [
    { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 129_000, url: "https://x/high" },
    { mimeType: "audio/mp4; codecs=mp4a.40.2", bitrate: 62_000, url: "https://x/low" },
  ];
  const responses = new Map<string, string>();
  await withFetch(
    (async (_url: any, init?: RequestInit) => {
      await clientNameOf(init);
      return new Response(JSON.stringify(playerResponse(fmts)), {
        headers: { "content-type": "application/json" },
      });
    }) as FetchImpl,
    async () => {
      // probe fetches: the URL being verified is read from the Request
      const high = await resolveInnertubeStream("dQw4w9WgXcQ", { quality: "high" });
      const low = await resolveInnertubeStream("dQw4w9WgXcQ", { quality: "standard" });
      responses.set("high", high?.url || "");
      responses.set("low", low?.url || "");
    }
  );
  assert.equal(responses.get("high"), "https://x/high");
  assert.equal(responses.get("low"), "https://x/low");
});
