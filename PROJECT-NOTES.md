# Resona — project notes for sandbox recovery

Everything a fresh sandbox session needs to continue working on this repo.
The working tree can be wiped between sessions; GitHub is the source of truth.

## Repo & credentials

- **GitHub repo**: `carlsibug98-spec/Resona` (public), default branch `main`
- **Token**: the user re-uploads `upload/token for all.txt` (GitHub PAT,
  `github_pat_…`) with each session — read it from there, never commit it.
  If it is missing, ask nothing and work read-only / explain the blocker.
- Clone: `git clone https://x-access-token:$TOKEN@github.com/carlsibug98-spec/Resona.git`
  inside `/home/z/my-project/`.
- **Always push to main** (user's standing instruction). CI (desktop.yml)
  builds on pushes to main that touch `src/**`, `desktop/**`, `scripts/stage-desktop.js`,
  `next.config.ts`, `package.json`.

## What this app is

Electron desktop music app (Spotify-style UI) that streams from YouTube
Music via keyless innertube calls. Next.js (App Router) web app + Electron
shell that boots the Next standalone server as a hidden child process and
loads it in a frameless window.

- Web app: `src/` (Next 15, React, zustand stores, plain globals.css)
- Electron: `desktop/main.js` (+ `preload.js`, `afterpack.cjs`, `installer.nsi`)
- Server libs: `src/lib/server/` — `innertube.ts` (YT Music pipeline),
  `kworb.ts` (trending charts), `cache.ts` + `db.ts` (SQLite via libsql),
  `resolver.ts` (stream URL via yt-dlp → Piped → Invidious), `lrclib.ts` (lyrics),
  `musicbrainz.ts`, `spotify.ts` (playlist import)
- Tests: `node --test tests/*.test.ts` (`npm test`) — 90 tests, all must pass.
  CI runs them too (`.github/workflows/test.yml` — needs `npm install` first!).
- Versions live in THREE places: `package.json`, `desktop/package.json`,
  `src/lib/version.ts`. Bump all three together when cutting a release.

## Release process (v1.6.6 onwards)

1. Bump the three version files, update `CHANGES.md`.
2. **Update README.md — REQUIRED, every release/build (rule from the
   owner, 2026-11-17).** Bump every version string in the file: the hero
   "Download (v…)" line, the Downloads table (Windows exe, macOS DMG
   arm64+x64, Linux AppImage+deb links + sizes), a new "What's new in
   v<version>" section on top, and the `Get-FileHash` / macOS / Linux
   lines in "Install on Windows". Old version mentions inside historical
   what's-new bullets stay. A release must not ship while README still
   names the previous version — release scripts grep-guard this.
3. Commit + push to `main` → desktop.yml builds **Windows installer (NSIS exe),
   macOS dmg, Linux AppImage+deb** as artifacts on the run. NOTE: the
   `head_sha` filter on the runs API needs the FULL 40-char SHA — short
   SHAs silently return zero runs.
4. Create the GitHub release (draft or published) with tag `v<version>`.
5. Download the artifacts from the run
   (`/actions/runs/<id>/artifacts` — Windows artifact is ~157MB zip
   containing `Resona-Setup-<v>.exe` + `.blockmap` + `latest.yml`)
   and upload them as release assets, INCLUDING `latest.yml`
   (electron-updater reads it from the release page for auto-update).
   All three platform artifacts ship as of v1.7.2.
6. INSTALL-GUIDE.txt goes up too — regenerate it per version (it names
   the exe and the what's-new). See `scripts/gh-release-upload.py` for
   an API uploader.

**v1.6.5 lesson (fixed in v1.6.6): the release page must contain
`Resona-Setup-<v>.exe` + `latest.yml`, never a zip built in the sandbox.**
A zip staged on Linux ships Linux native modules (`@libsql/linux-x64-gnu`,
`sharp-linux-x64`) which crash every server API route on Windows —
search/trending/home all render empty. The exe artifact from the
windows-latest CI runner is the only safe Windows deliverable.

## Architecture notes that bit us

- `db.ts` must import `@libsql/client` through `safeRequire` (never a bare
  import): libsql resolves its native binding at require time, and a
  wrong-OS package makes the import throw, killing every API route that
  touches the cache. Graceful degradation to memory-only is required.
- `kworb.ts`: `TrendingResult` = `{ entries, source }` (detailed, used by
  catalog.ts) and `getTrending()` returns `{ tracks, source }` (used by the
  trending route). Keep the shapes distinct and typed.
- innertube client rotation: WEB_REMIX → IOS → ANDROID contexts
  (`innertubeRotating`) — some networks bot-gate one client.
- Search suggestions: `music/get_search_suggestions` innertube endpoint,
  `/api/search?suggest=1&q=…` returns `{ suggestions: string[] }`.
- Desktop data dir: `resonaDataDir()` in main.js — `C:\Resona` on Windows
  (falls back to `%LOCALAPPDATA%\Resona`), userData elsewhere. DB at
  `<dataDir>/data/resona.db`, log at `<dataDir>/server.log`.
- The `deps` rename trick: electron-builder strips root-level `node_modules`
  from extraResources, so the staged server's node_modules is renamed to
  `deps` and main.js points NODE_PATH at it. Do not "fix" this.

## Sandbox quirks

- `z-ai vision -i <local file>` works for JPG frames; the video endpoint
  rejects local mp4s (error 1210). Extract frames with ffmpeg first
  (`fps=0.5,scale=960:-1`), then describe frames one by one.
- The vision responses land in `/tmp/vision_out/*.json` (content in
  `.choices[0].message.content`).
- Node 24 + npm 11 + bun are preinstalled. `npm install` in the repo takes
  ~3–4 min.
- Videos from the user live in `/home/z/my-project/upload/` and are the
  ground truth for UI/UX requests. v1.6.6 videos:
  - `20261115-2353-51.0192320.mp4` — Resona search returning "No results" for "maha" (bug report)
  - `Screen Recording 2026-11-16 075322.mp4` — Spotify search dropdown reference (recent searches, suggestions, top song rows, ↑↓/Enter hints, right Now Playing panel)
  - `20261115-2356-53.4633929.mp4` — Spotify library collapse (expanded ↔ icon rail) + Now Playing panel hide/show chevrons
