// Deeper probe of youtubei.js decipher + alternate approaches
import { Innertube } from "youtubei.js";

async function main() {
  const yt = await Innertube.create({ retrieve_player: true });
  const player = (yt.session as any).player;
  console.log("player status:", player?.status, "| locked:", player?.locked);

  const info = await yt.getInfo("dQw4w9WgXcQ");
  const formats: any[] = info.streaming_data?.adaptive_formats || [];
  const audio = formats
    .filter((f) => String(f.mime_type || "").startsWith("audio"))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  console.log("audio formats:", audio.length);
  for (const f of audio) {
    console.log(
      ` - itag=${f.itag} mime=${f.mime_type?.slice(0, 30)} br=${f.bitrate} url=${!!f.url} sigcipher=${!!f.signature_cipher} scrypted=${!!f.sc}`
    );
  }
  console.log("hls_manifest:", info.streaming_data?.hls_manifest_url?.slice(0, 60) || null);

  // try decipher on best
  if (audio.length) {
    const best = audio[0];
    try {
      const url = await best.decipher(player);
      console.log("decipher OK, len:", url?.length);
      const head = await fetch(url, { headers: { Range: "bytes=0-1023" } });
      console.log("fetch:", head.status, head.headers.get("content-type"));
    } catch (e: any) {
      console.log("decipher err:", e.message?.slice(0, 150));
      // try decipher_only
      try {
        const u2 = await best.decipher_only(player);
        console.log("decipher_only OK len:", u2?.length);
      } catch (e2: any) {
        console.log("decipher_only err:", e2.message?.slice(0, 150));
      }
    }
  }
}
main().catch((e) => {
  console.error("FATAL", e?.message || e);
  process.exit(1);
});
