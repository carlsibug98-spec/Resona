# Third-party notices

Resona is GPL-3.0-or-later (see LICENSE). It builds on these projects:

## Musify (gokadzev/Musify) — GPL-3.0

The playback/download internals ported in v1.7.6 (client ladder, quality
tier selection, playback failure policy, sequential offline playlist
downloads) and, as of v1.7.7, the **libmpv playback core**: Resona ships
`libmpv-2.dll` taken from Musify's Windows release and drives it over the
koffi FFI the same way Musify's media_kit does. Source:
https://github.com/gokadzev/Musify

## libmpv / mpv — GPL-2.0-or-later (LGPL-2.1-or-later portions)

`libmpv-2.dll` is the mpv media player's library build (mpv.io,
https://github.com/mpv-player/mpv). Bundled as a separate binary; mpv's
license texts are available at https://github.com/mpv-player/mpv/blob/master/COPYING
(GPL) and COPYING.LGPL (LGPL portions).

## koffi — MIT

The FFI used to call libmpv from Node/Electron.
https://github.com/Koromix/koffi

## Electron, Next.js, React, and all npm dependencies

Each dependency's license ships in its package inside `server/deps/`.
The Electron runtime is MIT (The Electron Developers).

## yt-dlp — Unlicense

Bundled as `yt-dlp.exe` for the resolver fallback. https://github.com/yt-dlp/yt-dlp
