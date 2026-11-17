/**
 * Live (network) check of the v1.7.2 verification chain — the real
 * resolveStream() against real YouTube, no stubs. Answers:
 *  1. does InnerTube answer clean URLs on THIS network?
 *  2. do those URLs pass the new 1-byte range probe?
 *  3. what does resolveStream return end-to-end?
 */
import { resolveStream } from "../src/lib/server/resolver.ts";
import { resolveInnertubeStream } from "../src/lib/server/innertube-stream.ts";
import { verifyAudioUrl } from "../src/lib/server/cache.ts";

const VIDEO = process.argv[2] || "dQw4w9WgXcQ";

console.log(`\n== raw InnerTube race on ${VIDEO} ==`);
const t0 = Date.now();
const raw = await resolveInnertubeStream(VIDEO).catch((e) => {
  console.log("  threw:", e.message);
  return null;
});
console.log(`  ${Date.now() - t0}ms →`, raw ? `${raw.provider} ${raw.url.slice(0, 60)}…` : "null");

if (raw) {
  console.log("\n== verify the raw URL serves bytes ==");
  console.log("  verifyAudioUrl:", await verifyAudioUrl(raw.url));
}

console.log("\n== full resolveStream chain ==");
const t1 = Date.now();
const r = await resolveStream(VIDEO, null, { ytdlp: false, fresh: true });
console.log(`  ${Date.now() - t1}ms →`, JSON.stringify(r, null, 2).slice(0, 400));

if (r.url) {
  console.log("\n== re-verify the winning URL ==");
  console.log("  verifyAudioUrl:", await verifyAudioUrl(r.url));
}
