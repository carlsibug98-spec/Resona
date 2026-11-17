/**
 * Batch live repro for the "some tracks still don't play" report.
 * For each video, through the REAL chain (no stubs):
 *  1. resolveStream (fresh) — who wins, how fast
 *  2. verifyAudioUrl on the winner
 *  3. fetch bytes 0-2047 EXACTLY like the browser's media element would
 *     (plain fetch + Range) — status AND content-type. A 200 text/html
 *     answer passing verify is the hole I suspect is still open.
 *  4. per-track raw android-sdkless /player: list every format's url and
 *     verify each — does the top-bitrate format die while a lower one lives?
 *  5. on resolve-null: diagnoseStream per-provider trace
 */
import { resolveStream, diagnoseStream } from "../src/lib/server/resolver.ts";
import { verifyAudioUrl, fetchWithTimeout } from "../src/lib/server/cache.ts";

const VIDEOS = [
  "dQw4w9WgXcQ", // Rick Astley
  "9bZkp7q19f0", // PSY
  "kJQP7kiw5Fk", // Despacito
  "JGwWNGJdvx8", // Shape of You
  "OPf0YbXqDm0", // Uptown Funk
  "fJ9rUzIMcZQ", // Bohemian Rhapsody
  "hTWKbfoikeg", // Smells Like Teen Spirit
  "rYEDA3JcQqw", // Rolling in the Deep
  "CevxZvSJLk8", // Roar
  "60ItHLz5WEA", // Faded
];

const SDKLESS_BODY = {
  context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en", gl: "US", userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip", osName: "Android", osVersion: "11" } },
  videoId: "",
  contentCheckOk: true,
  racyCheckOk: true,
};

/** fetch bytes like the media element would, report status+content-type */
async function browserFetch(url: string) {
  try {
    const res = await fetchWithTimeout(url, { headers: { Range: "bytes=0-2047" } }, 8000);
    const ct = res.headers.get("content-type") || "?";
    const len = res.headers.get("content-range") || res.headers.get("content-length") || "?";
    let head = "";
    try {
      const buf = await res.arrayBuffer();
      head = new TextDecoder().decode(buf.slice(0, 120)).replace(/\s+/g, " ").slice(0, 100);
    } catch { /* */ }
    return { status: res.status, ct, len, head };
  } catch (e) {
    return { status: -1, ct: `throw:${(e as Error).message.slice(0, 40)}`, len: "-", head: "" };
  }
}

/** raw sdkless player call: inspect EVERY format */
async function rawFormats(videoId: string) {
  const body = JSON.stringify({ ...SDKLESS_BODY, videoId });
  try {
    const res = await fetchWithTimeout(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      5000
    );
    const data: any = await res.json();
    const status = data?.playabilityStatus?.status;
    const reason = data?.playabilityStatus?.reason || "";
    const fmts: any[] = data?.streamingData?.adaptiveFormats || [];
    const lines: string[] = [];
    for (const f of fmts.slice(0, 6)) {
      if (!f.url) { lines.push(`    fmt ${f.itag} ${String(f.mimeType).split(";")[0]} ${(f.bitrate/1000)|0}k — NO url (signatureCipher)`); continue; }
      const v = await verifyAudioUrl(f.url);
      lines.push(`    fmt ${f.itag} ${String(f.mimeType).split(";")[0]} ${(f.bitrate/1000)|0}k — verify:${v ? "LIVE" : "dead"}`);
    }
    return `status=${status}${reason ? ` (${reason.slice(0, 40)})` : ""} formats=${fmts.length}\n${lines.join("\n")}`;
  } catch (e) {
    return `player threw: ${(e as Error).message.slice(0, 50)}`;
  }
}

for (const id of VIDEOS) {
  const t0 = Date.now();
  const r = await resolveStream(id, null, { ytdlp: false, fresh: true });
  const ms = Date.now() - t0;
  console.log(`\n=== ${id} — ${ms}ms — provider: ${r.provider ?? "NONE"} — proxied:${r.proxied ?? false}`);
  if (!r.url) {
    console.log("  resolve FAILED → diagnosing:");
    const d = await diagnoseStream(id, null);
    for (const p of d.providers) console.log(`    ${p.ok ? "✓" : "✗"} ${p.provider} ${p.ms}ms — ${p.detail}`);
    continue;
  }
  const verified = await verifyAudioUrl(r.url);
  const b = await browserFetch(r.url);
  const audioOk = /audio|video|octet-stream/i.test(b.ct) && b.status >= 200 && b.status < 300;
  console.log(`  verify:${verified ? "PASS" : "FAIL"} | browser-fetch: ${b.status} ct=${b.ct} range=${b.len}`);
  if (!audioOk) console.log(`  ⚠️ NOT AUDIO IN BROWSER — head: ${b.head}`);
  console.log(`  VERDICT: ${audioOk ? "PLAYS" : "SILENT TRACK"}`);
}
console.log("\n== per-format deep dive on one track ==");
console.log(await rawFormats(VIDEOS[2]));
