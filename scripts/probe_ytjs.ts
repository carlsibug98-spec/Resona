// Probe: can youtubei.js resolve a playable audio URL from this sandbox?
import { Innertube } from "youtubei.js";

const TEST_IDS = ["dQw4w9WgXcQ", "vTc-5O9agPs"];

async function main() {
  console.log("creating session...");
  const yt = await Innertube.create({ retrieve_player: true });
  console.log("session ok, client:", yt.session.client_type);

  for (const id of TEST_IDS) {
    try {
      const info = await yt.getInfo(id);
      const ps = info.playability_status;
      const formats = info.streaming_data?.adaptive_formats || [];
      const audio = formats
        .filter((f: any) => String(f.mime_type || "").startsWith("audio"))
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      console.log(`\n[${id}] status=${ps?.status} reason=${ps?.reason || "-"}`);
      console.log(`  adaptive=${formats.length} audio=${audio.length}`);
      if (audio.length) {
        const best = audio[0] as any;
        const url = best.url || (await best.decipher(yt.session.player));
        console.log(`  best: ${best.mime_type?.slice(0, 40)} bitrate=${best.bitrate}`);
        console.log(`  url ok: ${!!url} len=${url?.length || 0}`);
        if (url) {
          const head = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1023" } });
          console.log(`  fetch test: ${head.status} ${head.headers.get("content-type")}`);
        }
      }
      const hls = info.streaming_data?.hls_manifest_url;
      console.log(`  hls: ${!!hls}`);
    } catch (e: any) {
      console.log(`\n[${id}] ERROR: ${e.message?.slice(0, 200)}`);
    }
  }
}

main().catch((e) => {
  console.error("FATAL", e?.message || e);
  process.exit(1);
});
