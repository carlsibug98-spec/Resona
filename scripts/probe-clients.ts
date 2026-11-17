/** raw per-client probe: exact payloads innertube-stream.ts uses */
const CLIENTS = {
  "android-vr": {
    clientName: "ANDROID_VR", clientVersion: "1.62.27", deviceMake: "Oculus", deviceModel: "Quest 3",
    userAgent: "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12; eureka-user Build/SQ3A.220705.004) gzip",
    osName: "Android", osVersion: "12", androidSdkVersion: 32,
  },
  "android-sdkless": {
    clientName: "ANDROID", clientVersion: "20.10.38",
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    osName: "Android", osVersion: "11",
  },
  "android-music": {
    clientName: "ANDROID_MUSIC", clientVersion: "2.16.032",
    userAgent: "com.google.android.apps.youtube.music/2.16.032 (Linux; U; Android 11) gzip",
    osName: "Android", osVersion: "11",
  },
  "tvhtml5-embed": {
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0",
    userAgent: "Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
  },
};

const videoId = process.argv[2] || "kJQP7kiw5Fk";
for (const [name, client] of Object.entries(CLIENTS)) {
  const t0 = Date.now();
  const extras = name === "tvhtml5-embed" ? { thirdParty: { embedUrl: "https://www.youtube.com/" } } : {};
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": client.userAgent, Origin: "https://www.youtube.com" },
    body: JSON.stringify({
      context: { client: { ...client, hl: "en", gl: "US" }, ...extras },
      videoId, contentCheckOk: true, racyCheckOk: true,
    }),
  }).catch((e) => null);
  if (!res) { console.log(`${name}: THREW after ${Date.now() - t0}ms`); continue; }
  const data: any = await res.json().catch(() => null);
  const st = data?.playabilityStatus?.status;
  const reason = data?.playabilityStatus?.reason || "";
  const fmts: any[] = data?.streamingData?.adaptiveFormats || [];
  const audio = fmts.filter((f) => f.url && String(f.mimeType || "").startsWith("audio/"));
  console.log(`${name}: ${res.status} playability=${st}${reason ? ` (${reason.slice(0, 60)})` : ""} fmts=${fmts.length} audioWithUrl=${audio.length} — ${Date.now() - t0}ms`);
}
