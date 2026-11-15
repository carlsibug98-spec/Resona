/**
 * Prepares desktop/staging for electron-builder:
 *  - copies the Next.js standalone build into desktop/staging/server
 *  - copies static assets and public files
 *  - downloads yt-dlp.exe (best effort)
 * Run AFTER `next build` (with output: "standalone").
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const staging = path.join(root, "desktop", "staging");
const serverDir = path.join(staging, "server");

function copy(from, to) {
  fs.cpSync(from, to, { recursive: true, force: true });
}

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Run `next build` first — .next/standalone/server.js not found.");
  process.exit(1);
}

fs.rmSync(serverDir, { recursive: true, force: true });
copy(standalone, serverDir);
copy(path.join(root, ".next", "static"), path.join(serverDir, ".next", "static"));
if (fs.existsSync(path.join(root, "public"))) {
  copy(path.join(root, "public"), path.join(serverDir, "public"));
}

// prune non-runtime folders that output tracing may carry over
for (const junk of [
  ".env", // points at a sandbox path; nothing in the server reads it at runtime
  "skills", "examples", "tests", "scripts", "download", "upload",
  "desktop", "dev.log", "bun.lock", "eslint.config.mjs",
  "tsconfig.tsbuildinfo", "Caddyfile", "LICENSE", "README.md",
  "postcss.config.mjs", "tailwind.config.ts", "components.json",
]) {
  fs.rmSync(path.join(serverDir, junk), { recursive: true, force: true });
}

// electron-builder's extraResources filter hard-excludes any root-level
// "node_modules" directory (app-builder-lib filter.js), which silently ships
// the server WITHOUT its dependencies -> instant crash on Windows. Rename it
// so the filter does not match; desktop/main.js points NODE_PATH at "deps".
const nm = path.join(serverDir, "node_modules");
const deps = path.join(serverDir, "deps");
if (fs.existsSync(nm)) {
  fs.rmSync(deps, { recursive: true, force: true });
  fs.renameSync(nm, deps);
}

// optional: bundle yt-dlp so direct streams work out of the box
// (Windows: yt-dlp.exe · macOS: yt-dlp_macos · Linux: yt-dlp)
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const ytdlpName = isWin ? "yt-dlp.exe" : "yt-dlp";
const ytdlpUrl = isWin
  ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
  : isMac
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
const ytdlp = path.join(staging, ytdlpName);
if (!fs.existsSync(ytdlp)) {
  try {
    if (isWin) {
      execFileSync("powershell", [
        "-Command",
        `Invoke-WebRequest -Uri "${ytdlpUrl}" -OutFile "${ytdlp}"`,
      ]);
    } else {
      execFileSync("curl", ["-sL", "-o", ytdlp, "--max-time", "180", ytdlpUrl]);
      fs.chmodSync(ytdlp, 0o755);
    }
  } catch {
    console.warn(`download of ${ytdlpName} failed — continuing without it.`);
  }
}

console.log("staging ready:", serverDir);
