<div align="center">

<img src="assets/banner.png" width="100%" alt="Resona — free music streaming desktop app">

# Resona

### Stream & download high-quality music, free, no ads, no login.

![Release](https://img.shields.io/github/v/release/carlsibug98-spec/Resona?style=flat-square&label=RELEASE&color=1ed760)
![Stars](https://img.shields.io/github/stars/carlsibug98-spec/Resona?style=flat-square&label=STARS&color=1ed760)
![Forks](https://img.shields.io/github/forks/carlsibug98-spec/Resona?style=flat-square&label=FORKS&color=1ed760)
![Issues](https://img.shields.io/github/issues/carlsibug98-spec/Resona?style=flat-square&label=ISSUES&color=1ed760)
![License](https://img.shields.io/github/license/carlsibug98-spec/Resona?style=flat-square&label=LICENSE&color=1ed760)

**[⬇️ Download (v1.6.4) HERE — it's free](https://github.com/carlsibug98-spec/Resona/releases/latest)** &nbsp;·&nbsp; **[🌐 Download site](https://carlsibug98-spec.github.io/Resona/)** &nbsp;·&nbsp; **[🐞 Report an issue](https://github.com/carlsibug98-spec/Resona/issues)**

</div>

---

## 📦 Downloads

| Platform | Status | Download | Details |
| --- | --- | --- | --- |
| 🪟 **Windows** 10 / 11 (64-bit) | ✅ **v1.6.4** | **[⬇️ Download EXE](https://github.com/carlsibug98-spec/Resona/releases/latest/download/Resona-Setup-1.6.4.exe)** | Installer · ~155 MB |
| 🍎 **macOS** (Apple Silicon) | ✅ **v1.6.4** | **[⬇️ Download DMG (arm64)](https://github.com/carlsibug98-spec/Resona/releases/latest/download/Resona-1.6.4-arm64.dmg)** | Unsigned — right-click → Open the first time |
| 🍎 **macOS** (Intel) | ✅ **v1.6.4** | **[⬇️ Download DMG (x64)](https://github.com/carlsibug98-spec/Resona/releases/latest/download/Resona-1.6.4-x64.dmg)** | Unsigned — right-click → Open the first time |
| 🐧 **Linux** (AppImage / .deb) | ✅ **v1.6.4** | **[⬇️ AppImage](https://github.com/carlsibug98-spec/Resona/releases/latest/download/Resona-1.6.4.AppImage)** · **[⬇️ .deb](https://github.com/carlsibug98-spec/Resona/releases/latest/download/Resona-1.6.4.deb)** | x64 |
| 📱 **iOS / Android** | 🧭 Planned | — | Mobile app in design |

> **All releases:** [github.com/carlsibug98-spec/Resona/releases](https://github.com/carlsibug98-spec/Resona/releases) · **Install guide:** [INSTALL-GUIDE.txt](https://github.com/carlsibug98-spec/Resona/releases/download/v1.6.4/INSTALL-GUIDE.txt)

## ✨ What's new in v1.6.4

- **🎤 Lyrics you can read again** — the lyrics panel no longer strands you: auto-follow snaps straight to the active line when you open it or seek, glides line-to-line while the song plays, and — like Spotify — resumes on its own a few seconds after you scroll manually (the Sync button is still there for an instant re-anchor; click any line to jump to it).
- **📋 A lyrics restyle** — the album art folds into a compact header row so the words own the whole panel, upcoming lines are bright enough to actually read, and past lines fade with distance instead of blurring away.
- **🚫 No more parked-scrollbar stripe** — the thick vertical line that lived down the right side of every list was the scrollbar lighting up on hover; it now appears only while you scroll and fades out after.

## ✨ What's new in v1.6.3

- **🖼️ One mark everywhere** — the taskbar / Dock / start-menu icon is now the **five-bar Resona mark** the header and website already use, in paper cream on a warm-dark squircle. It replaces the old v1.4.0 broadcast-waves design.
- **🔎 Crisp at every size** — the Windows icon (16→256 px) is rendered natively per size instead of downscaled from one bitmap; tiny taskbar sizes get an optically heavier stroke so the bars stay readable.
- **🌐 Favicon** — the web app gets the same mark as `/icon.svg`.

## ✨ What's new in v1.6.2

- **🎛️ Taskbar playback controls** — hover Resona's taskbar icon on Windows and the thumbnail preview carries **Previous / Play / Next** buttons, Spotify-style (macOS: the same three in the dock menu). Buttons dim honestly at dead-ends.
- **🪟 A window that feels native** — frameless window with the app's own header (min / max / close, drag anywhere), a collapsible library rail, a docked resizable queue with Queue / Recently played tabs, overlay scrollbars and tooltips.
- **✅ Honest onboarding + phone fixes** — checklist steps complete when you actually do the thing, the popover can't be clipped, and the phone layout got several repairs.

## ✨ What's new in v1.6.1

- **⚡ Instant starts** — the stream resolves in the background while you hover or press a row (450 ms intent), the next queue track resolves ahead, and the server merges duplicate resolves — the first click on a song no longer waits for yt-dlp / Piped fallbacks (up to ~25 s before).
- **👆 Click anywhere to play** — the whole track row is clickable, not just the small hover-revealed play button; the play / like / save / ⋯ buttons keep their own actions.

## ✨ What's new in v1.6.0

- **🔄 The app updates itself** — on launch Resona silently downloads a newer release while the splash screen shows live progress (10-second cap), installs it and starts the new build. v1.6.0 was the last manual install; every later version arrives on its own.
- **✅ Getting-started checklist** — a progress ring around the profile avatar fills as you finish six steps (search, make a playlist, like a song, start a radio, download for offline, import your music); hovering the avatar shows the checklist popover.
- **📌 Queue drawer** — the queue button opens a Now playing / Next up panel; long-press a row (350 ms) and drag to reorder, tap to jump, Esc closes.
- **🖼️ Real artist artwork** — the Popular artists shelf shows real YouTube Music photos (the 1.5.0 loader shipped broken and is fixed), card play buttons are centred on the cover again, the snackbar is a proper bottom bar with actions, and the sidebar wears the brand wordmark.

## ✨ What's new in v1.5.0

- **🏡 A home that welcomes you** — first run opens on "Welcome to Resona" with a **Getting started** carousel (search, playlists, likes, radio, downloads, import) on top; no quick tiles until you actually have something. First like, playlist, download or import switches to the full home.
- **🌍 Global shelves** — **Popular artists** (round covers, real artist pages), **Popular albums and singles**, and **New releases** (green NEW badges) — single-row shelves with arrows, built live from the worldwide trending chart and playable in one tap.
- **🪟 New download site** — the download page was redesigned (paper palette, equalizer hero, per-platform buttons, live SHA-256 checksum) and now updates its own version labels, sizes and links from the GitHub releases API.

## ✨ What's new in v1.4.0

- **🎬 Real music videos** — the Video button in full-screen now playing plays the song's actual video inside the app, perfectly docked into the mockup's video panel. Leaving video mode returns to audio at the exact same position.
- **🎤 Real credits** — the full-screen Credits card is filled from MusicBrainz: writers, producers, performers, album and year (with an honest fallback for unknown tracks).
- **📡 Radio** — *Start radio* in any track menu queues the YouTube Music mix for that song (up to 40 tracks), and **autoplay radio** keeps the music going when your queue runs out (toggle in Settings → Playback).
- **🍎🐧 macOS & Linux builds** — `.dmg` for Apple Silicon and Intel, `.AppImage` and `.deb` for Linux, built by CI alongside the Windows installer, with per-platform yt-dlp bundled.
- **✍️ Code-signing pipeline** — the build signs itself the moment you add signing secrets; see [SIGNING.md](SIGNING.md) for the free (SignPath) and cheap (Certum ~€25/49) routes to kill the SmartScreen warning for good.

## ✨ What's new in v1.3.0

- **🎨 Full UI redesign, built from the approved mockup** — sidebar + Your Library card, quick tiles, "Jump back in" / "Made for you" shelves, frosted-card play buttons, pill chips, karaoke lyrics panel and a full-screen now-playing view (art / lyrics / video / credits modes).
- **🎵 Real synced lyrics everywhere** — time-synced karaoke lyrics with a word-by-word fill, blur on distant lines, tap-to-seek and a *Sync to song* button when you scroll away. Powered by LRCLIB.
- **🌱 Starter content on first run** — the home looks alive from the first open: a few OPM picks, a "Late night" playlist, liked songs and history. All of it resolves into real, playable tracks and can be removed in **Settings → Starter content**.
- **⬇️ Working offline downloads** — every track row and the player bar show live download progress (ring → green check). Saved audio plays without a connection, and removing a download always asks first.
- **🔄 Update check on open** — Resona silently compares its version against the GitHub releases page once an hour and flags "Update available" in the account menu and in **Settings → Updates**.
- **☀️ Real light mode** — the whole canvas, not just the cards, now follows the Light / Dark / Auto theme.

## ✨ Features

- **🎧 Unlimited streaming** — millions of songs, albums and live sets via YouTube Music. Search, press play, done.
- **🎬 Real music videos & synced lyrics** — watch the actual video in full-screen mode; karaoke-style lyrics powered by LRCLIB.
- **📡 Song radio & autoplay** — endless similar songs from any track.
- **📋 Playlists & Spotify import** — paste any public Spotify playlist URL; Resona search-matches every track into a local playlist.
- **⬇️ Offline downloads** — save songs locally through the built-in downloader and play them without a connection.
- **🏠 Spotify-style home** — quick tiles, made-for-you shelves, two-panel sidebar and a full-width player bar.
- **👤 No account needed** — install and play. No sign-up, no email, no tracking. Your library stays on your machine.
- **💚 100% free & open source** — MIT licensed. No ads, no premium tier, forever.

## 🖼️ Screenshots

| Home | Synced lyrics | Playlists |
| --- | --- | --- |
| ![Home](website/screenshots/home.png) | ![Lyrics](website/screenshots/lyrics.png) | ![Playlists](website/screenshots/playlist.png) |

## 🚀 Install on Windows

1. **Download** `Resona-Setup-1.6.4.exe` from the [releases page](https://github.com/carlsibug98-spec/Resona/releases/latest) (~155 MB). Once installed, later versions arrive automatically at launch.
2. **If Windows SmartScreen shows a warning** — this is expected and safe. Resona's installer is *not code-signed* (a signing certificate costs ~$100+/yr), so Windows warns about every app it hasn't seen before. It does **not** mean a virus was found. To run the installer:
   - Click **More info** → **Run anyway**. That's it.
   - Or, if the download finished already: right-click the `.exe` → **Properties** → tick **Unblock** → OK, then double-click it.
   - After install, launch from the desktop shortcut. The app itself doesn't need unblocking again unless SmartScreen has never seen it run before.
3. Follow the wizard — a desktop shortcut is created automatically. Play music.

**Verify (SHA-256):** compare against the checksum published in each release's notes:

```
Get-FileHash .\Resona-Setup-1.6.4.exe   # in PowerShell
```

**macOS**: the `.dmg` is unsigned — right-click Resona → **Open** the first time (or `xattr -d com.apple.quarantine /Applications/Resona.app`).  
**Linux**: `chmod +x Resona-*.AppImage && ./Resona-*.AppImage`, or install the `.deb` with `sudo apt install ./Resona-1.6.4.deb`.

> Signed builds are on the roadmap — until then the two steps above are the only friction.

## 🛠️ Build from source

```bash
git clone https://github.com/carlsibug98-spec/Resona.git
cd Resona
bun install          # or npm install

# Web app
bun run dev          # http://localhost:3000
bun run build        # Next.js production build (standalone output)
bun run start        # serve the production build

# Windows desktop installer
node scripts/stage-desktop.js
cd desktop && npx electron-builder --win nsis
# → desktop/dist/Resona-Setup-<version>.exe
```

## 🧭 How things work

| Topic | Details |
| --- | --- |
| **Playback** | Resona tries three sources in order: an offline copy saved in IndexedDB → a direct audio stream through a same-origin proxy (Piped/Invidious resolvers, configurable in Settings) → the official YouTube embedded player. Resolution starts while you hover a row and the next queue track resolves ahead; results are cached 30 minutes **in SQLite, so they survive restarts** — every start after the first is instant. |
| **Downloads** | The same resolver pipeline fetches the audio, shows a progress ring in every row, and stores it in IndexedDB. Downloaded tracks play with zero network. Removing one asks for confirmation first. |
| **Lyrics** | LRCLIB's synced LRC lines drive the karaoke panel; unsynced text and "no lyrics" states are handled honestly. |
| **Library** | Likes, playlists and history live in localStorage *and* in the server's SQLite database (mirrored on every change, merged at boot) — a wiped browser profile no longer loses the library, and history keeps up to 500 entries instead of 60. |
| **Database** | SQLite via libsql + Drizzle ORM: the persistent TTL cache (`kv`) and the library mirror (`likes`, `playlists`, `playlist_tracks`, `history`). One file at `RESONA_DB_PATH` — the OS user-data dir on desktop (`<userData>/data/resona.db`), `./resona.db` in dev. If the file can't be opened the app degrades to memory-only and still runs. |
| **Home & onboarding** | First run opens the Welcome home (Getting started carousel, no quick tiles). The first like / playlist / download / import graduates you to the full home. Upgrades from earlier versions keep the full home. |
| **Global shelves** | Popular artists / Popular albums and singles / New releases come from the worldwide trending chart via `/api/catalog` (6 h server cache, 30 min per-track resolve cache shared with the Trending view). Artist cards open real artist pages. |
| **Starter content** | The mockup's OPM demo tracks are seeded on first run and resolved through real search — no invented video ids. Remove everything in Settings → Starter content; anything you added yourself is untouched. |
| **Updates** | On launch the desktop app checks this repo's releases; a newer build is downloaded while the splash screen shows progress, then installed and started (10-second cap — on slow connections the app opens and the update finishes on the next quit). The hourly in-app check remains as a fallback and surfaces "Update available" in the account menu and Settings → Updates. |
| **Backups** | Likes, playlists and history export as JSON (account menu → *Export now*). Restoring offers merge or replace per section. Downloaded audio stays on its device by design. |

## 🧱 Tech stack

| Layer | Tech |
| --- | --- |
| UI | Next.js (App Router) · React · Zustand · mockup-derived design system |
| Music data | YouTube Music (innertube) · kworb charts (81 regions) |
| Storage | SQLite (libsql + Drizzle ORM) for cache + library · IndexedDB for audio |
| Playback | HTML5 audio / YouTube embedded player · resolver-proxied direct streams |
| Lyrics | lrclib.net (time-synced) |
| Desktop | Electron 45 + electron-builder (NSIS) |
| License | MIT |

## ⚠️ Disclaimer

Resona is a media interface that streams publicly available content via YouTube Music's public catalog. It does **not** host, store, or distribute any music files. All content remains the property of its respective copyright holders. Users are responsible for complying with the laws and terms of service in their own jurisdiction. Resona is **not affiliated with YouTube, Google or Spotify**.

## 📄 License

Released under the [MIT License](LICENSE) — free to use, study, modify and share.
