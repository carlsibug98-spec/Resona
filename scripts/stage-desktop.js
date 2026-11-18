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
// (Windows: yt-dlp.exe · macOS: yt-dlp · Linux: yt-dlp)
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

// The mpv playback core (v1.7.7): libmpv-2.dll is vendored at
// desktop/build-libmpv-2.dll (from Musify's release, GPL-2+ — see
// THIRD_PARTY_NOTICES.md) and ships as a root extraResource next to
// server/ and yt-dlp.exe. desktop/mpv-host.js loads it from
// process.resourcesPath. The koffi FFI must ship inside the server's
// deps/ tree (it is require()d by mpv-host through Electron's node).
const libmpvSrc = path.join(root, "desktop", "build-libmpv-2.dll");
if (fs.existsSync(libmpvSrc)) {
  // staged unconditionally: the Windows CI runner and local cross-builds
  // both package from this repo file; only the Windows target ships it
  // (see the win.extraResources filter in desktop/package.json)
  fs.copyFileSync(libmpvSrc, path.join(staging, "libmpv-2.dll"));
  console.log("staged libmpv-2.dll (the Musify playback core)");
} else {
  console.warn("libmpv-2.dll missing — mpv engine disabled, HTML5 fallback only");
}
const koffiPkg = path.join(root, "node_modules", "koffi");
if (fs.existsSync(koffiPkg)) {
  // mpv-host.js requires koffi; it resolves through NODE_PATH (deps/) at
  // runtime, mirroring the server's own dependency resolution. koffi's
  // native binary lives in @koromix/koffi-<platform> sibling packages —
  // stage BOTH the win32 build (the shipped installer) and the local
  // platform's (so dev runs work); koffi picks whichever loads.
  const koffiDest = path.join(serverDir, "deps", "koffi");
  if (fs.existsSync(koffiDest)) fs.rmSync(koffiDest, { recursive: true, force: true });
  fs.cpSync(koffiPkg, koffiDest, { recursive: true, force: true });
  const nmKoromix = path.join(root, "node_modules", "@koromix");
  const destKoromix = path.join(serverDir, "deps", "@koromix");
  const ensurePkg = (ent) => {
    const src = path.join(nmKoromix, ent);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(destKoromix, ent), { recursive: true, force: true });
      return true;
    }
    return false;
  };
  fs.mkdirSync(destKoromix, { recursive: true });
  // win32 native: present on the Windows CI runner; on other platforms,
  // fall back to the vendored copy (desktop/vendor/koffi-win32-x64) pulled
  // once via `npm pack` so local cross-builds produce a working installer
  if (!ensurePkg("koffi-win32-x64")) {
    const vendored = path.join(root, "desktop", "vendor", "koffi-win32-x64");
    if (fs.existsSync(vendored)) {
      fs.cpSync(vendored, path.join(destKoromix, "koffi-win32-x64"), { recursive: true, force: true });
    } else {
      console.warn("koffi-win32-x64 not found — mpv engine will be missing in the Windows build");
    }
  }
  // the local platform's native (dev runs; harmless in the shipped build)
  ensurePkg(`koffi-${process.platform}-${process.arch}`);
  console.log("staged koffi (FFI for libmpv) into server deps");
}

console.log("staging ready:", serverDir);
