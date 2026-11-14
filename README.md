<div align="center">

<img src="assets/banner.png" width="100%" alt="Resona — free music streaming desktop app">

# Resona

### Stream & download high-quality music, free, no ads, no login.

![Release](https://img.shields.io/github/v/release/carlsibug98-spec/Resona?style=flat-square&label=RELEASE&color=1ed760)
![Stars](https://img.shields.io/github/stars/carlsibug98-spec/Resona?style=flat-square&label=STARS&color=1ed760)
![Forks](https://img.shields.io/github/forks/carlsibug98-spec/Resona?style=flat-square&label=FORKS&color=1ed760)
![Issues](https://img.shields.io/github/issues/carlsibug98-spec/Resona?style=flat-square&label=ISSUES&color=1ed760)
![License](https://img.shields.io/github/license/carlsibug98-spec/Resona?style=flat-square&label=LICENSE&color=1ed760)

**[⬇️ Download (v1.3.0) HERE — it's free](https://github.com/carlsibug98-spec/Resona/releases/latest)** &nbsp;·&nbsp; **[🌐 Download site](https://carlsibug98-spec.github.io/Resona/)** &nbsp;·&nbsp; **[🐞 Report an issue](https://github.com/carlsibug98-spec/Resona/issues)**

</div>

---

## 📦 Downloads

| Platform | Status | Download | Details |
| --- | --- | --- | --- |
| 🪟 **Windows** 10 / 11 (64-bit) | ✅ **v1.3.0** | **[⬇️ Download EXE](https://github.com/carlsibug98-spec/Resona/releases/latest/download/Resona-Setup-1.3.0.exe)** | Installer · ~155 MB |
| 🍎 **macOS** (Apple Silicon & Intel) | 🔜 Soon | — | In testing |
| 🐧 **Linux** (AppImage / .deb) | 🔜 Soon | — | In testing |
| 📱 **iOS / Android** | 🧭 Planned | — | Mobile app in design |

> **All releases:** [github.com/carlsibug98-spec/Resona/releases](https://github.com/carlsibug98-spec/Resona/releases) · **Install guide:** [INSTALL-GUIDE.txt](https://github.com/carlsibug98-spec/Resona/releases/download/v1.3.0/INSTALL-GUIDE.txt)

## ✨ Features

- **🎧 Unlimited streaming** — millions of songs, albums and live sets via YouTube Music. Search, press play, done.
- **🎬 Synced lyrics** — time-synced, karaoke-style lyrics line by line, powered by lrclib.
- **📋 Playlists & Spotify import** — paste any public Spotify playlist URL; Resona search-matches every track into a local playlist.
- **⬇️ Offline downloads that just work** — the app keeps its own downloader (yt-dlp) up to date automatically and falls back to a live fleet of community instances, so downloads work out of the box.
- **🔄 Self-updating** — on launch the desktop app checks GitHub releases, downloads any newer version in the background and installs it on restart. No manual reinstalling.
- **🏠 Spotify-style home** — quick tiles, trending charts, made-for-you shelves, two-panel sidebar and a full-width player bar.
- **👤 No account needed** — install and play. No sign-up, no email, no tracking. Your library stays on your machine.
- **💚 100% free & open source** — MIT licensed. No ads, no premium tier, forever.

## 🖼️ Screenshots

| Home | Synced lyrics | Playlists |
| --- | --- | --- |
| ![Home](website/screenshots/home.png) | ![Lyrics](website/screenshots/lyrics.png) | ![Playlists](website/screenshots/playlist.png) |

## 🚀 Install on Windows

1. **Download** `Resona-Setup-1.3.0.exe` from the [releases page](https://github.com/carlsibug98-spec/Resona/releases/latest) (~155 MB)
2. If SmartScreen shows a warning, click **More info → Run anyway** (the installer isn't code-signed yet)
3. Follow the wizard — a desktop shortcut is created automatically. Play music.

**Verify (SHA-256):**
```
40bfd939b9e904d49ab668e175947d56da578a159b62bf23e09226dc380eabce
```

## 🛠️ Build from source

```bash
git clone https://github.com/carlsibug98-spec/Resona.git
cd Resona
bun install          # or npm install

# Web app
bun run build        # Next.js production build (standalone output)
bun run start        # serve at http://localhost:3000

# Windows desktop installer
node scripts/stage-desktop.js
cd desktop && npx electron-builder --win nsis
# → desktop/dist/Resona-Setup-<version>.exe
```

## 🧱 Tech stack

| Layer | Tech |
| --- | --- |
| UI | Next.js (App Router) · React · Zustand · Tailwind-style CSS |
| Music data | YouTube Music (innertube) · kworb charts (81 regions) |
| Playback | HTML5 audio / YouTube embedded player · yt-dlp direct streams |
| Lyrics | lrclib.net (time-synced) |
| Desktop | Electron 45 + electron-builder (NSIS) |
| License | MIT |

## ⚠️ Disclaimer

Resona is a media interface that streams publicly available content via YouTube Music's public catalog. It does **not** host, store, or distribute any music files. All content remains the property of its respective copyright holders. Users are responsible for complying with the laws and terms of service in their own jurisdiction. Resona is **not affiliated with YouTube, Google or Spotify**.

## 📄 License

Released under the [MIT License](LICENSE) — free to use, study, modify and share.
