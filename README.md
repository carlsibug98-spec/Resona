# Resona

**Resona** is a free, open-source music streaming web app — an independent, clean-room reimplementation of the system behind [OpenSpot Music](https://github.com/BlackHatDevX/openspot-music-app) (different code, same ideas). No login, no ads, no tracking.

## Features

- **Search** — millions of tracks via YouTube Music metadata (songs, artists, views, durations)
- **Stream** — playback through the official YouTube embedded player, with a native-audio path when a direct-stream resolver is configured
- **Trending** — region-based trending chart (81 regions) with daily refresh, powered by kworb.net YouTube data
- **Likes & Playlists** — create, rename, delete, export playlists; like songs; everything stored locally
- **Spotify playlist import** — paste a public playlist URL; every track is fuzzy search-matched (typically ~100% match rate)
- **Downloads** — offline audio stored in IndexedDB (needs a configured resolver for direct streams; otherwise tracks are marked *stream-only*)
- **Lyrics** — time-synced scrolling lyrics (LRCLIB), click any line to seek; plain-text fallback
- **Queue & full player** — shuffle, repeat one/all, play-next, queue reordering, drag-free recontextualization, Media Session (lockscreen) controls
- **Artist pages** — popular tracks, albums and singles with full discography browsing
- **Albums** — open any album from an artist page and play it through
- **Themes** — pure monochrome (white / black / gray) with light, dark, and auto (system) modes
- **Recently played** — local history of the last 60 tracks

## The music source

Search metadata comes from YouTube Music's public web API (`music.youtube.com/youtubei/v1`, `WEB_REMIX` client). Playback uses the **official YouTube IFrame embed** in your browser — the same source OpenSpot streams from. Direct audio streams for offline downloads are resolved through configurable community instances (Piped / Invidious compatible). Lyrics come from [LRCLIB](https://lrclib.net). Trending charts come from [kworb.net](https://kworb.net/youtube/).

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4 + shadcn/ui (monochrome neutral theme)
- Zustand (client state + localStorage persistence)
- IndexedDB for offline audio blobs
- In-memory TTL cache on all upstream API routes

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
```

## Configuration

All settings live in the in-app **Settings** page:

- Theme (light / dark / auto)
- Default trending region
- Direct-stream resolver instances (one URL per line, Piped/Invidious API compatible)
- Export / wipe all local data

## Credits & license

- Inspired by [OpenSpot Music](https://github.com/BlackHatDevX/openspot-music-app) by Jash Gro — original codebase, same product system, zero code copied.
- Lyrics: LRCLIB · Charts: kworb.net · Music: YouTube
- MIT License — see [LICENSE](./LICENSE)
