# Changes

## v1.7.8 — the playback root-cause fix (2026-11-20)

"Music playback not playing the song — it always reloads and stops": root-caused
to three independent defects in the v1.7.7 mpv core, all fixed. Found by reading
the mpv client API (`client.h`) and mpv's own playloop source, not by guessing:

- **mpv was handed a relative URL and opened it as a file path.** The renderer
  built `/api/stream?videoId=…` (correct for a browser element) and sent it
  over IPC verbatim — but mpv runs in the main process, where that string is a
  local file path. Every open failed, `waitForMpvLoad` burned its full 12 s on
  EVERY track before the HTML5 ladder even started, and the HTML5 ladder then
  raced bot-gated networks. That is the "always reload". Now the engine
  absolutizes against `window.location.origin` (the window IS loaded from
  `http://127.0.0.1:<port>`, the same Next server the proxy lives on).
- **A failed load auto-advanced the queue.** `tryMpv` set `usingMpv = true`
  before the load was confirmed, and every end-file event — including
  `end-file(reason=error)` for the failed open — was treated as end-of-song:
  `onEnded` fired, `next()` loaded the next track, the stale ladder for the
  OLD track then finished over the NEW track's engine state. The queue index
  and the audio desynced, failures stacked, and after 3 consecutive failures
  the Musify policy stopped playback. That is the "and stop". Now the engine
  receives the end-file REASON (`mpv_event_end_file` decoded over koffi):
  error-while-pending → fail fast to HTML5; error-while-playing → a counted
  playback error; eof → advance; stop/quit (our own commands) → ignore.
- **End-of-song never advanced at all.** With `keep-open=always` mpv does NOT
  send `end-file(reason=eof)` at a natural end of track — verified in mpv's
  playloop: `handle_keep_open()` flips `stop_play` to `KEEP_PLAYING` before
  `end_current_file()` ever runs, so the file stays loaded (paused at EOF) and
  the event that v1.7.7 relied on for queue advance never fires. The engine
  now watches the `eof-reached` property in the 400 ms tick (surfaced by
  `mpv:state`) and advances exactly once per track (latched, un-latched by
  seek so repeat-one replays work).
- **Supporting fixes:** failed mpv opens now fall through to HTML5 within
  milliseconds (idle/error events latch the wait instead of the full 12 s
  deadline); the user's volume is applied to every fresh mpv load (mpv boots
  at 100 and v1.7.7 never applied the setting on the mpv path); a load
  generation counter makes rapid track switches safe — a stale ladder can no
  longer finish after a newer load and overwrite the engine's track; resuming
  from keep-open's end-of-file pause replays from the top instead of
  re-hitting EOF; the host's event pump isolates per-event decode failures so
  one bad event can no longer silence every event after it; `mpv:available`
  reports an honest libmpv check.

## v1.7.7 — the Musify playback core: libmpv (2026-11-18)

"use Musify entirely, but our UI" — the last piece was the audio engine
itself. v1.7.6 ported Musify's resolution/download logic; v1.7.7 ships
its actual playback core:

- **libmpv is now the playback engine.** Resona bundles `libmpv-2.dll`
  (the same binary Musify ships) and drives it over the koffi FFI in the
  Electron main process (`desktop/mpv-host.js`) — mpv's own demuxer,
  decoder and network stack instead of the browser media pipeline. No
  codec quirks, no autoplay policies, Musify's playback reliability.
- **URL policy (sandbox-verified before shipping):** mpv's embedded
  ffmpeg 403s direct googlevideo URLs (its no-Range GET triggers a 302
  the follow-up request can't survive), but plays the same-origin byte
  proxy perfectly — so mpv always plays through `/api/stream`, where the
  server fetches googlevideo with the minted UA. Verified live: decoded
  playback, correct 213.16 s duration, seek and pause.
- **The whole engine is a fallback ladder, not a replacement:** local
  downloaded copies stay on the HTML5 element (blob URLs, no network);
  if mpv is missing (web build, broken DLL) or a track fails to load in
  it, the existing HTML5 direct → proxy → iframe chain serves the track
  exactly as before. The Musify failure policy (2 s auto-skip, stop
  after 3) rides on top unchanged.
- **Relicensed MIT → GPL-3.0-or-later** with THIRD_PARTY_NOTICES.md:
  porting Musify's logic and shipping its libmpv binary makes Resona a
  derivative work of GPL projects; the license now says so honestly.

## v1.7.6 — Musify engine port (2026-11-18)

The playback/download internals of Musify (gokadzev/Musify, GPL-3) —
studied from its source — merged into Resona, keeping Resona's UI:

- **Audio quality that actually works.** The Standard/High setting was
  decorative; now it is wired end to end, Musify's
  `selectAudioOnlyStreamForQuality` adapted: a codec-compatibility score
  (AAC/mp4 best, opus next, Dolby excluded as last resort) dominates,
  bitrate breaks ties. High takes the top tier, Standard the lower band
  (live-verified: 130,677 vs 50,152 bps on the same track through the
  same client). The setting rides every stream request and every
  download; per-quality server cache like Musify's
  `song_<id>_<quality>_url`.
- **Playlist batch download** (Musify's `OfflinePlaylistService.
  _processDownloadQueue`): a Download-all button on every playlist —
  sequential queue (one resolve in flight, no bot-gate-triggering
  bursts), tracks already saved are skipped and counted, live
  "Downloading <song> · n/m" progress with a bar, failures counted and
  reported, cancel stops after the current track.
- Everything else from Musify's engine was already in Resona (sequential
  client ladder with per-client retry, minting-UA discipline, bot-gate
  escalation, next-track preload, offline-first playback).
- **Playback failure policy (Musify parity, `_handlePlaybackError`)** —
  a track that fails to start auto-skips to the next song after 2 s
  (cancelled if the user moves or anything starts playing); playback
  stops with the manual Retry banner only after 3 consecutive failed
  tracks, and any track that plays resets the counter. The start
  watchdogs are patient now too: a source is abandoned only when NO
  bytes have arrived (12 s direct / 15 s proxy); a
  downloading-but-slow stream keeps its full 30 s / 45 s budget instead
  of the old fixed 8 s / 15 s kills. Supersedes the v1.7.3
  "never advance on failure" rule, which turned one slow song on a
  throttled network into "playback stopped on its own". Guard test:
  `tests/playback-failure-policy.test.ts`.

## v1.7.5 — the Spotify search experience (2026-11-18)

Built from the user's reference screen recording (frame-by-frame
analysis of Spotify's search flow):

- **No in-page search bar.** The top-bar search is the only search box,
  exactly like the recording — the results page renders whatever query
  it was navigated with. The old in-page "What do you want to listen
  to?" bar is gone.
- **Search-box width matches the reference: ~710px, centered, identical
  on home and results pages** (measured from the video: x 645–1355 at
  1920 wide).
- **Filter tabs** — All / Songs / Playlists / Albums / Artists — with
  per-type layouts: card grids for Playlists/Albums/Artists, a full
  song table for Songs, and the combined view for All.
- **Top-result hero card** beside the song list (Spotify's two-column
  layout): big artwork, big title, green play button.
- **Album & community-playlist search results.** `searchCollections`
  queries YouTube Music's albums / community-playlists filters via the
  base64 `params` tokens (the plain `filter` name is silently ignored),
  parsing the new row shape (navigation lives on the item itself,
  MPRE…/VL… browse ids). Albums show "Single · Artist · Year",
  playlists show "Creator · views"; both navigate to the album view.
- **Suggestion dropdown: skeleton shimmer rows** while suggestions
  load (the grey bars in the recording), and the top-bar input mirrors
  the current search page's query (deep links, recents).
- **Dropdown spans the search box exactly** — same left edge, same width,
  zero offset (pixel-measured against the recording: Spotify's dropdown
  647–1357 vs the box 648–1356). It was previously shifted 60px left and
  capped at 560px.
- **Search length capped at Spotify's exact 708px** (pixel-measured
  x 648–1356 on the 1920-wide reference frame), down from 710px.
- **Impeccable pass (Emil Kowalski's skills)**: strong custom easing
  tokens (`--ease-out`, `--ease-in-out` from easing.dev) on the search
  box, dropdown, and chips; `:active` press states (scale .97) on filter
  chips and the Top-result card; card titles/subtitles clamp to 2/1
  lines so deluxe-edition-length names can't stretch cards.

## v1.7.4 — artist pages were empty and clicks did nothing (2026-11-18)

The symptom: "not playing entirely". Searching worked, but artist pages
showed a blank hero, the Play button was dead, and clicking tracks led
nowhere — while other apps (Musify) played the same songs instantly.

### Root cause 1 — YouTube changed the artist-page response shape

YouTube Music's `browse` endpoint stopped returning the renderers
Resona parsed (`musicImmersiveHeaderRenderer`, `musicShelfRenderer`).
Every artist page now answers with `musicVisualHeaderRenderer` +
`musicCarouselShelfRenderer` containing `musicTwoRowItemRenderer`
items. Resona found nothing it recognized and returned
`{name: "", songs: []}` — with HTTP 200. The UI treated that as a
loaded page: empty hero, **disabled Play button**, no error. Clicking a
track's artist navigated to one of these empty pages, which looked
exactly like "the app is broken".

Fixed:
- `browseArtist` now parses `musicVisualHeaderRenderer` (name + avatar)
  and mines songs from `musicTwoRowItemRenderer` carousel items
  (title, artist, videoId, view count), alongside the old shapes for
  compatibility. Verified live: Rick Astley → 25 songs, 10 albums,
  10 singles; OxYy → 10 songs.
- The Songs/Albums split is now by navigation target (watch endpoint =
  song, browse endpoint = album), not by carousel title alone.

### Root cause 2 — the 10-minute InnerTube blackout overcorrected

v1.7.3 armed a flat 10-minute IP-wide blackout after ONE track rolled
three gated ladder answers. But the bot gate **flaps per request** on
residential IPs: the next track often passes seconds later. One unlucky
track made every later track skip the fast path for 10 minutes and
fall to the (mostly dead) public instance fleet — "nothing plays".

Fixed: escalating backoff — 30 s → 1 m → 2 m → 5 m (capped), reset by
any non-gated ladder outcome or success. A flapping IP now recovers in
half a minute instead of ten.

### Also in this release

- **Full-screen player is audio + lyrics only** — the video mode
  (music-video playback via the YouTube embed, the Video toggle in
  Settings) is removed. The hidden embed remains internally as the
  last-resort audio source when direct and proxied streams both fail.
- Investigated porting Musify's free-public-proxy fallback
  (proxyscrape/proxifly): live-tested with real routing — free proxy
  IPs get bot-gated too, so it adds latency without beating the gate.
  Not adopted; the escalation above plus the verified-URL chain is the
  better trade.
- Playback failures always surface a banner with Retry / Skip / Run
  diagnostics — never silent.

## v1.7.3 — stay on failed tracks, sequential InnerTube ladder (2026-11-17)

- A track that fails to start now stays put with an error banner
  (retry / skip are manual). v1.7.1's auto-advance silently skipped
  failing tracks and masked the real breakage behind "a few broken
  songs".
- The InnerTube client ladder (ANDROID_VR → sdkless ANDROID → TVHTML5)
  runs strictly sequentially — the v1.7.0-1.7.2 parallel race
  burst-POSTed /player 4× per track and tripped YouTube's IP bot-gate.
- Playback of InnerTube URLs always goes through the byte proxy with
  the minting client's User-Agent (the <audio> element sends Chrome's
  UA, which googlevideo rejects for app-client URLs).

## v1.7.2 — some tracks were silent: dead URLs no longer win (2026-11-17)

The symptom: after v1.7.0, some tracks just wouldn't play — no error,
no audio — while they played fine on v1.6.x. The queue auto-advanced
(v1.7.1) so it looked like "a few broken songs" rather than one real
regression.

Root cause — **v1.7.0 made "resolved" mean "playable" without checking**:

- The resolver races providers (InnerTube clients, yt-dlp, Piped/
  Invidious instances) and v1.7.0 let the **first provider to answer**
  win, then cached its URL for 30 minutes as a "hit". But answering
  isn't serving: a Piped instance can hand out a googlevideo URL that
  403s the moment the browser fetches it, and InnerTube clients can
  answer with client-keyed URLs that die instantly. Whichever dead URL
  answered first won, got cached, and the track was silent until the
  cache expired — often after the listener had already skipped it.
- v1.6.x didn't have this because yt-dlp ran with strict priority
  before the instance fleet, and the fleet was smaller and slower.

The fix — **a URL is only trusted after it serves bytes** (the same
guarantee Musify and OpenSpot get by resolving in the process that
plays):

- New `verifyAudioUrl()` (1-byte `Range: bytes=0-1` probe, ~100-300 ms,
  body-cancelled so a Range-ignoring server can't start a download):
  every provider — InnerTube client race, yt-dlp, Piped, Invidious —
  now verifies its URL **before** it can win the race, before it's
  cached, and before an instance is pinned as "last working".
- Inside the InnerTube race this is per-client: a client answering with
  a dead URL loses to a slower live client instead of nullifying the
  whole fast path.
- Dead URLs are never returned and never cached as hits: the chain
  moves to the next provider and the user gets the first URL that
  actually plays.
- Byte-proxy self-healing (v1.7.0) still covers URLs that die *between*
  resolve and play.

Tests: 113 (was 106) — the race semantics (dead-answer-loses, live
caches, `verifyAudioUrl` unit tests) are locked by `tests/resolver-verify.test.ts`
and a new dead-client race case in `tests/innertube-stream.test.ts`;
verified live end-to-end (resolve → probe → proxy delivered real
MPEG-4 audio bytes, 206 + content-range, ~250 ms resolve).

## v1.7.1 — "click play, it pauses again" fixed (2026-11-17)

The symptom: pressing play on a track that couldn't start made the
button flip straight back to paused. Reproduced in a real browser on a
fully-gated network and traced to three causes:

- **The zombie engine** — after every source failed, play() just poked
  dead media elements, the state poll reported "not playing", and the
  button reverted. play() now detects there is no live source and
  reloads the track for real (one fresh retry pass per click).
- **Phantom error events** — each failed stream probe tears down the
  audio element, which fires an async error event *after* the probe
  already finished. Those counted as extra playback errors, tripping
  the "too many failures" stop before auto-advance could run, so the
  queue sat on the dead track forever. Probe teardowns are now
  attributed to the probe.
- **The single-track queue never advanced** — play-from-artist starts a
  one-song queue; the old advance logic only ran for longer queues.
  Now any failure schedules one advance, extending the queue with the
  song radio when it runs out.

Failure UX when nothing can play on a network:

- Failures surface in ~5 s (was 30 s+ of silence): videos the YouTube
  embed refused (removed/private/embedding-disabled) are remembered for
  10 minutes and skip the whole chain on retry.
- The banner gained a **Run diagnostics** action that jumps straight to
  the provider report; Retry reloads the exact failed track even after
  the queue moved on.
- Consecutive errors now count failed *tracks*, not failed attempts —
  two flaky songs no longer stop playback for the session.

Also: full-chain resolve misses are cached 2 minutes, so repeat clicks
don't re-pay the provider race; rapid track changes can no longer leave
a stale probe timer armed over the next track.

## v1.7.0 — the playback hang is fixed, and a real UI/UX pass (2026-11-17)

The "still doesn't play anything" report led to three genuine bugs:

- **The infinite retry loop (root cause)** — v1.6.9's one-retry guard
  was reset by the very `load()` call the retry made: iframe error →
  reload → direct fail → proxy fail → iframe → error → reload, forever.
  No error was ever shown and the queue never advanced — playback just
  silently spun. The guard now keys on the videoId, so each track gets
  exactly one retry and then a clear failure.
- **The YouTube iframe API could hang forever** — if the script can't
  load (offline, firewall), `loadYT()` never settled and every playback
  attempt stalled with no feedback. It now fails after 10 s, the failure
  surfaces, and the next attempt retries the script.
- **The parallel race could pick a failure as its winner** — `Promise.any`
  resolves with the first *non-rejected* result, and providers resolve
  `null` on failure — so a fast-failing resolver beat a slower working
  one. Found by the new unit tests; both the InnerTube race and the
  instance-fleet race now use a first-truthy race.

More playback hardening:

- **Four InnerTube clients raced in parallel** (was two, sequential):
  sdkless ANDROID, ANDROID_MUSIC, ANDROID_VR (the Quest client that
  answers even for embed-disabled videos — cobalt's strategy) and
  TVHTML5_SIMPLY_EMBEDDED_PLAYER (the embed client, with the required
  thirdParty context). One round trip, first usable answer wins.
- **yt-dlp now races the instance fleet** instead of running alone first
  — its 1–25 s spawn no longer sits in front of every track on machines
  where it also fails.
- **Playback error banner** — a track that can't start shows a
  persistent banner with Retry / Skip instead of a 2-second toast; the
  next successful play clears it.
- **Playback diagnostics** — Settings → Direct-stream resolvers →
  "Diagnostics" runs every provider (each InnerTube client, yt-dlp, all
  discovered instances) and shows a table of ok/fail + ms, with "Copy
  report". If anything still doesn't play on your machine, that report
  says exactly why.

UI/UX pass:

- **Volume control** — an icon + expanding slider in the player bar;
  volume and mute now persist across restarts (they didn't before).
- **Seekbar** — drag to scrub with pointer capture, a hover time
  tooltip, and a grabbable knob.
- **Buffering** — the play button becomes a spinner while a stream
  buffers; `waiting`/`stalled` events surface immediately instead of at
  the next 400 ms poll.
- **Skeleton loaders** — home shelves and search results show shimmering
  placeholders instead of "Loading…" text.
- **Polish** — gentle view-change transition, cover-art fade-in,
  keyboard focus rings on the new controls, reduced-motion respected
  throughout.

## v1.6.9 — playback that survives dead instances, no more starter content (2026-11-17)

Two fixes for the two things you reported:

- **"Can't play any song" / "playback blocked for embedded users"** —
  every song fell through to the YouTube iframe because all five
  compiled-in resolver instances had died (the error itself comes from
  videos whose uploader disallows embedding — the iframe is the one
  place they can never play). The resolver now runs a real instance
  fleet: fresh live defaults (verified against the official Invidious
  registry and the Piped instance list), runtime discovery every 6 h
  from those same lists so the app outlives its defaults, the last
  working instance tried first, and Invidious `local=true` proxy URLs
  that are not IP-bound. When a cached stream URL dies mid-session the
  byte proxy re-resolves once instead of serving a 502 until the cache
  expires, and if the iframe still ends up as the last resort the
  engine retries the audio paths once before showing any error. All
  fleet parsing is unit-tested against the live document formats
  (15 Piped hosts, 6 Invidious hosts parse correctly).
- **Hardcoded starter content removed** — the first-run seeder (seeded
  "Liked" songs, the "Late night" playlist, three starter mixes, the
  OPM Daily Mix tile and a fake play history) is gone. A one-time
  migration removes exactly that content from installs that already
  have it — locally and from the server's database — matched by
  title+artist so anything you added yourself is never touched; a
  "Late night" playlist you rebuilt with your own songs survives. New
  installs start with an empty library. The "Trending PH" tile now
  follows your region setting instead of being hardcoded.

## v1.6.8 — instant playback (Spotube-style resolver), taskbar controls that actually light up (2026-11-16)

Both complaints had one root cause: stream resolution ran a yt-dlp
process (1–25 s) on the critical path of pressing Play, and when it
failed the app fell back to the YouTube iframe — which plays, but owns
the media session, so Windows taskbar controls never appeared for
Resona.

- **Fast resolver** — new `innertube-stream.ts` resolves the googlevideo
  audio URL with one HTTPS POST to InnerTube's `/player` endpoint using
  the sdkless ANDROID client (the Spotube / youtube_explode strategy):
  ~130–400 ms instead of seconds. Ciphered formats are skipped, the
  ANDROID_MUSIC client is the second try, and a 10-minute gate cache
  remembers IPs where YouTube bot-gates the endpoint. yt-dlp and
  Piped/Invidious remain as fallbacks (now raced in parallel instead of
  one 8-second timeout at a time), and a failed resolve is cached for
  only 20 s — previously one failure stuck for 30 minutes.
- **Direct-URL playback** — the engine now asks the server for the
  resolved URL (`/api/stream?resolve=1`) and hands it straight to the
  `<audio>` element: no proxy hop, Chromium starts buffering
  immediately (measured 131 ms cold resolve + 36 ms to first frames).
  The byte-proxy path stays as fallback; the iframe is last resort.
  The next queue track's URL is warmed while the current one plays.
- **Taskbar media controls** — playing through a real audio element is
  what registers Resona with Windows' SMTC (the media flyout on
  Win10/11 with prev/play/next + metadata + seek); the iframe path
  could never do that. The Win10 thumbnail toolbar is additionally
  re-applied on window `show` and guarded against destroyed windows.

## v1.6.7 — overlay search, peeking Now Playing, reliable taskbar controls (2026-11-16)

Three behaviour fixes to match the reference app exactly:

- **Search overlays the page instead of navigating** — the top-bar search is a
  real input now (with the Ctrl+L shortcut badge). Focusing it opens a
  dropdown over whatever page you're on: recent searches when empty, live
  query suggestions plus the first artist/song hits (with artwork) while
  typing, ↑↓/Enter keyboard navigation. Only Enter navigates — to the full
  search page with the query prefilled. The search page's own dropdown was
  removed (it now lives in one place, the top bar).
- **Hidden Now Playing view keeps a peek rail** — instead of vanishing, the
  panel folds to a narrow dark sliver (~28px) at the right edge with the
  expand chevron, matching the reference; hovering it breathes it wider
  (46px, with an ambient hue glow) and clicking re-opens the panel.
- **Taskbar media controls hardened** — the Windows thumbnail toolbar is
  re-applied on window focus, restore, leave-fullscreen and page load, with
  timed retries after first show (Windows drops it on frameless windows);
  the media session now reports position state and handles
  seek/seekto/stop, so the SMTC overlay (media flyout + hardware keys) is
  fully functional too.

## v1.6.6 — search that works everywhere, Spotify-style search box (2026-11-16)

The v1.6.5 Windows zip was staged on Linux and shipped Linux native modules
(`@libsql/linux-x64-gnu`, `sharp-linux-x64`) — on Windows the database import
threw at module load and took **every** server API route down with it: search
answered "No results" for anything, and home/trending shelves never loaded.
v1.6.6 fixes the failure and the packaging:

- **A broken database can never kill the app again** — `db.ts` loads libsql
  through a safe require; a missing or wrong-OS native binding degrades to
  memory-only (verified by poisoning the import in a live server test:
  search still answers 200 with full results)
- **Search: client rotation + honest errors** — YouTube Music requests now
  rotate WEB_REMIX → IOS → ANDROID clients when one is bot-gated or parses
  empty; when the source is truly unreachable the UI says "Search is
  unreachable right now" with a retry button instead of a fake "No results"
- **Spotify-style search dropdown** — while typing: live query suggestions
  plus top artist/song rows with artwork ("Song · Artist" subtitles),
  ↑↓ / Enter keyboard navigation with the hint bar, on outside-click
  dismiss; when idle: Recent searches with per-item and bulk clear
- **Now Playing view edge chevrons** (Spotify parity) — a chevron on the
  panel's inner edge hides it; while hidden, a chevron riding the main
  content's right edge brings it back. The library's collapse to an icon
  rail was already in — both now match the reference behaviour
- **Dedicated data folder on Windows: `C:\Resona`** — database and
  `server.log` live there (created on first launch, falls back to
  `%LOCALAPPDATA%\Resona` when the drive root is not writable); other
  platforms keep the OS user-data dir
- **Trending route type bug fixed** — `getTrending`'s return shape
  disagreed with `TrendingResult` (a pre-existing type error on main that
  broke the trending view's data path)
- **CI repaired** — `test.yml` now installs dependencies before running
  the suite (the libsql-dependent tests failed on every runner before)
- **Release packaging fixed** — the Windows release is the NSIS installer
  **exe** + `latest.yml` from the windows-latest CI artifact (never a
  sandbox-built zip), so auto-update works again

## v1.6.5 — a real database, nav refresh, never-empty shelves (2026-11-15)

The `feat/sqlite-drizzle-storage` branch merged to main. Highlights since v1.6.4:

- **Top-bar navigation (Spotify-style)** — green Home pill; the sidebar nav card is
  gone (Home & Search in the top bar, Settings & Trending in the profile menu)
- **Sidebar lyrics match fullscreen** — whole-line highlight everywhere; the
  word-by-word gradient sweep is removed
- **Taskbar media controls always work** — state is pushed on app start, window
  focus and every playback change; `mediaSession.playbackState` stays in sync
- **Never-empty shelves** — when kworb's chart site is unreachable, trending now
  falls back to YouTube Charts (same keyless pipeline, real playable tracks);
  a weak or empty chart resolution is never cached for hours; a cold server
  warms the home catalog at boot instead of showing "Loading…" for 30 seconds;
  the home UI gains retry buttons and says which source fed the shelves
- **SQLite under the app** (details below)

## v1.6.5 storage — a real database under the app (2026-11-15)

Resona used to keep everything in browser storage: likes, playlists and
history in localStorage, downloaded audio in IndexedDB, and the server's
caches (stream resolves, searches, lyrics, credits, trending) in a plain
in-memory Map. That Map was the painful one — every restart threw away
resolved stream URLs, and a cold resolve can cost up to 25 seconds
through yt-dlp.

The server now runs on **SQLite** (via libsql + Drizzle ORM — libsql *is*
SQLite in file form, and its N-API binding loads under plain Node, Bun and
Electron-as-Node without ABI rebuilds, which better-sqlite3 can't promise
in the packaged desktop app). The dead Prisma scaffold from the original
template (User/Post demo models, never imported anywhere) is gone.

What changed under the hood:

- **Persistent server cache** — `src/lib/server/cache.ts` keeps its
  synchronous in-memory hot path and now writes every entry to a `kv`
  table. A restart primes the Map from disk in the background, so lyrics,
  searches, artist pages and trending shelves come back instantly; stream
  resolves that already succeeded are never re-paid.
- **Library mirror** — likes, playlists and history are mirrored into
  SQLite (`likes`, `playlists`, `playlist_tracks`, `history` tables) and
  served by `GET /api/library`. The client hydrates from the server at
  boot with a last-write-wins merge against localStorage, so a wiped
  browser profile no longer wipes the library. History is bounded by a
  real limit (500 server-side, 200 in the client store) instead of 60.
- **Backup restore keeps both copies in step** — restoring a backup (or
  clearing all data) pushes the result to the server too.
- **Desktop: the database lives in the OS user-data dir**
  (`<userData>/data/resona.db`), so it survives app updates and never
  sits in the read-only install directory. The web/dev default is
  `./resona.db` next to the server.
- **Degradation is honest** — if the database can't be opened or its
  schema can't be created, every layer falls back to the previous
  behavior (memory-only) and logs one line. The app never refuses to
  start over storage.
- New tests: `tests/db-storage.test.ts` covers schema creation, library
  round-trips, replace-all, cache expiry and the restart scenario
  (a fresh module instance reading what the first one wrote).

### UI fixes from the audit (same build)

Ten findings from the v1.6.4 UI audit, all addressed:

- Artist names in track rows are now buttons (when the artist has a
  page) — underline on hover, opens the artist page; the ⋯ row menu
  gains a "Go to artist" item too.
- Search results now include an **Artists** row (round covers, from
  YouTube Music's artist filter) above Songs, and a result count with
  "Show all N results" instead of a silent 30-item cap.
- Settings and Trending moved into the main sidebar nav (they were
  reachable only through the account menu / home shelf).
- Recently played in the queue drawer and the Library history view now
  share one cap (200), so the lists agree.
- Long titles and artist names carry a tooltip everywhere they truncate
  (player bar, full-screen player, track rows).
- Touch devices (`hover: none`) see row play buttons and the ⋯ menu
  without hovering, and shelf play covers stay visible.
- `prefers-reduced-motion` now also stops the equalizer animation,
  shelf covers and smooth scrolling — not just the two backgrounds.
- Light theme: the green "New" badge was only 1.9:1 against a white
  card; it now uses a darker green (3.5:1) with white text.
- Every `<img>` in the app has an alt attribute (the new artist-search
  cards included).

## v1.6.4 — lyrics you can read again (2026-11-15)

A fix release for the two things the first v1.6.x shakedown surfaced:
the lyrics view could leave you staring at an empty panel, and a thick
gray stripe lived down the right side of the window.

### Lyrics that keep following the song

- Opening the lyrics panel mid-song (or seeking) could leave the view
  stranded: the auto-follow mistook its own smooth scrolling for you
  scrolling, gave up, and parked a "Sync to song" pill over the words
  while the active line drifted off the bottom edge. Follow now snaps
  instantly for long jumps, glides only for line-to-line moves, and —
  like Spotify — resumes on its own a few seconds after you scroll
  manually. The Sync button is still there when you want to re-anchor
  right now, and clicking any line still seeks to it.
- The lyrics restyle: the album art folds into a compact header row so
  the words own the whole panel, upcoming lines are bright enough to
  actually read, past lines fade with distance instead of blurring and
  shrinking, and the active line sits lower in the view like a synced
  lyrics card.

### No more parked-scrollbar stripe

- The overlay scrollbar used to light up its thumb whenever the mouse
  merely rested over a scroll area, which read as a thick vertical
  line down the right side of every list. The thumb now appears only
  while you are actually scrolling and fades out after, the way every
  other overlay scrollbar behaves.

### Housekeeping

- Version bump 1.6.3 → 1.6.4 (app, desktop installer, README, website).

## v1.6.3 — one mark everywhere: the app icon catches up (2026-11-15)

A small visual release: the app icon finally matches the mark the app
and the website already use.

### The new icon

- The taskbar / Dock / start-menu icon drops the old v1.4.0
  broadcast-waves design and adopts the **five-bar Resona mark** — the
  exact path the header and the website draw — in paper cream on a
  warm-dark squircle, the site's palette.
- Every size in the Windows `.ico` (16→256 px) is rendered natively
  from the vector instead of downscaled from one bitmap, and the tiny
  16/24/32 px entries carry an optically heavier stroke so the bars
  survive taskbar scale.
- The web app grows a favicon (`/icon.svg`) with the same mark, and
  `public/logo.svg` drops a stale unused placeholder for the canonical
  website mark.

### Housekeeping

- `scripts/make-icon.js` now generates the five-bar icon with sharp
  (it regenerated the old radio glyph in CI, which would have undone
  the new assets at build time); it also builds the multi-size `.ico`
  and replaces the old single-size `make-ico.js`.
- Version bump 1.6.2 → 1.6.3 (app, desktop installer, README, website).

## v1.6.2 — native shell: taskbar controls, frameless header, docked queue (2026-11-15)

The desktop app stops feeling like a browser in a box. Playback is
controllable from the taskbar, the window wears its own header, and the
queue became a docked panel.

### Taskbar playback controls

- **Windows**: hovering Resona's taskbar icon shows the thumbnail
  preview with **Previous / Play-Pause / Next** buttons — the same
  interaction Spotify has. The pause/play icon follows playback, and
  buttons disable honestly: Next dims at a queue dead-end unless repeat
  or autoplay radio can keep the music going. Windows drops the toolbar
  after fullscreen, so Resona re-applies it automatically.
- **macOS**: the same three controls in the dock menu.

### A window that looks native

- **Frameless window**: the app's own header draws the title row —
  min / max / close in the corner, draggable everywhere else, with the
  full-width search and home controls. The bridge stays minimal
  (contextBridge, five window methods plus the playback controls).
- **Collapsible library**: the sidebar folds down to a 72 px icon rail
  when you want the space — and folds itself on narrow windows when the
  queue or now-playing panel opens.
- **Docked queue**: the queue is a resizable column now, with Queue /
  Recently played tabs. Now playing docks into the same column; opening
  one replaces the other, and they share the resizable width.
- **Polish**: shorter player bar with the play button centred
  vertically and the seek bar below; overlay scrollbars that appear only
  while scrolling; tooltips; the website's logo mark and Space Grotesk
  wordmark in the shell.

### Audit fixes

- Visiting Search no longer completes the "Search anything" onboarding
  step by itself — running a real search does.
- The checklist popover is portalled to the page, so the header can't
  clip it; clicking a step opens the feature and the feature marks it
  done; "See what's next" navigates home and pulses the next pending
  card; the ring and pill disappear once all six steps are done.
- Phone: the player sits above the bottom nav; library tabs scroll
  sideways instead of clipping; the onboarding pill is visible without
  hover; the checklist popover stays on screen.

### Housekeeping

- Version bump 1.6.1 → 1.6.2 (app, desktop installer, README, website).
- 74 unit tests pass; tsc, eslint and the production build are clean.

## v1.6.1 — instant starts, click anywhere to play (2026-11-15)

Two playback fixes, both reported in the first days after 1.6.0: tracks
took too long to start, and only the tiny hover-revealed play button
started them.

### Faster playback starts

- **The first click no longer pays for stream resolution.** The first play
  of a track used to resolve its stream on the critical path — `/api/stream`
  could spawn yt-dlp (up to 25 s) and then fall back through Piped/Invidious
  instances before the first audio byte. Results were cached 30 minutes, so
  only the first click per song was slow — but that first click felt broken.
- **Hover = prefetch**: when your pointer rests on a track row (a 450 ms
  intent signal) or you press it, Resona fires the resolution request in the
  background, once per song per session. By the time you click play, the
  stream URL is already cached and playback starts instantly.
- **The queue resolves ahead**: whenever a song starts, the player store
  prefetches the upcoming queue track, so track-to-track transitions no
  longer wait for a resolve.
- **One resolve per song**: the server's cache now shares in-flight
  computations — a hover prefetch and the click that follows spawn exactly
  one yt-dlp run instead of racing duplicates (unit-tested).

### Play from anywhere

- **The whole track row is clickable** — not just the small play button.
  The play, like, save and ⋯ menu buttons keep their own handlers (a
  closest('button, a') guard routes the click correctly). Queue drawer rows
  and the home card play buttons prefetch on pointer-down too.

### Housekeeping

- Version bump 1.6.0 → 1.6.1 (app, desktop installer, website, README).
- 67 unit tests pass; tsc and eslint clean.

## v1.6.0 — the app that updates itself (2026-11-15)

Resona now installs its own updates, so for most people this is the last
manual download. The rest of the release makes the app feel finished.

### Silent auto-update

- **Updates install before the window opens**: on launch Resona checks this
  repo's releases, and when a newer build exists it downloads and installs
  it while the splash screen shows live progress ("Downloading update…
  47 %"), then starts the new version. The wait is capped at 10 seconds —
  on a slow connection the current version opens and the update quietly
  installs on the next quit.
- This release carries the update feeds (`latest.yml` + blockmaps for
  Windows, macOS and Linux) the updater reads. Installs from v1.5.0 and
  earlier don't have the updater — they need this one last manual install
  from the download site.

### Getting-started checklist (mockup v3)

- **Profile progress ring**: the top bar shows a ring that fills as you
  finish the six getting-started steps — search, make a playlist, like a
  song, start a radio, download for offline, import your music. Hovering
  the avatar slides out the checklist popover with per-step done state, an
  "Up next" tag, CTA buttons and a remaining-steps footer.
- **Steps complete themselves**: doing the real thing (visiting search,
  creating a playlist, liking a song, starting a radio, an offline save,
  importing or restoring a backup) marks its step done; the snackbar
  reports progress and its "See what's next" button pulses the home
  carousel's first card. Finished steps drop out of the carousel, all-done
  shows the mockup's "All set" note, and progress persists across
  restarts.

### Queue drawer

- **Now playing / Next up panel**: the queue button in the player bar opens
  a right-side drawer listing what's playing and what's coming. Long-press
  a row (350 ms) and drag to reorder — a drop line shows where it lands;
  tapping a row jumps to it and Esc closes the drawer.

### Real artist artwork + fixes

- **Popular artists show real photos**: the home shelf now fetches each
  artist's actual YouTube Music artwork instead of gradient initials, with
  the gradient as an instant placeholder while images load. (The artwork
  loader shipped broken in 1.5.0 — `Object.fromEntries` over the wrong
  shape — and is fixed here.)
- Card play buttons sit centred on the cover again; the snackbar became a
  proper bottom bar with an action button and 6-second auto-dismiss; the
  sidebar wears the brand wordmark with the logo dot, and the mobile top
  bar shows the dot too.

## v1.5.0 — a home that welcomes you (2026-11-15)

The home screen was rebuilt against the updated mockup. New listeners now get
a proper first-run experience, and everyone gets real global shelves.

### New-user home (first run)

- **Welcome home**: a fresh install opens on "Welcome to Resona" with the
  Getting started carousel on top — six gradient cards (search, playlists,
  likes, radio, downloads, import), three per page with arrows and dots.
  No quick tiles: "Liked songs" and "Recently played" only appear once the
  listener actually has some.
- **Getting started cards do the real thing**: Search anything opens Search,
  Make a playlist opens the create dialog, Import your music opens the
  import modal; the like/radio/download cards explain themselves with the
  mockup's toasts.
- **First-time sidebar cards**: the purple "Bring your music from other
  apps" import promo (dismissible for the session), "Create your first
  playlist" and "Let's find some artists to follow", exactly as the mockup.
- **Graduation**: the first thing you save yourself — liking a song,
  creating a playlist, finishing a download, importing or restoring a
  library — switches you to the full home. Playing music alone keeps the
  welcome alive, and the starter library seeding never graduates anyone.
  Existing 1.4 installs upgrade straight to the full home.

### Global shelves (everyone)

- **Popular artists, Popular albums and singles, New releases**: three
  single-row shelves with arrow buttons (85 % smooth scroll) and Show all,
  built from the worldwide trending chart — the same source as the Trending
  view, resolved to real playable tracks. Artist cards are round and open
  the artist's real page; the play button starts their charting track.
  New-release cards wear the green NEW badge with "Today".
- The shelves slot between "Jump back in" and "Made for you" on the full
  home (Music/All filter), and sit right under Getting started for new
  listeners. `/api/catalog` serves them from a 6 h server cache; failing
  gracefully hides the sections instead of breaking the home.

### Download site

- The GitHub Pages download site was redesigned: warm paper palette,
  equalizer hero, three-step install, dark screenshot band, features,
  what's-new, a downloads table with per-platform buttons (Windows, macOS
  Apple Silicon/Intel, Linux AppImage/.deb), a live SHA-256 checksum with
  copy, and FAQ. Version label, file names, sizes, checksums and download
  links now pull live from the GitHub releases API, so the page keeps
  itself up to date.

### Misc

- `onboarding` setting (v2 settings migration: upgrades start as returning
  listeners), kworb resolver gained a 30 min per-query cache shared by the
  trending view and the catalog, and trending rows keep their movement data
  (`NEW` badges) through resolution.

## v1.4.0 — real video, real credits, radio, macOS & Linux (2026-11-15)

The full-screen now playing view was rebuilt against the mockup once more and
now delivers everything the mockup promised — with real data behind it.

### Full-screen now playing (the focus of this release)

- **Real music videos**: the Video button now plays the song's actual music
  video inside the app. Playback hands over to the visible YouTube player at
  the current position and hands back to audio when you leave video mode —
  seek, shuffle, repeat, next/previous and the queue all keep working either
  way. The mockup's 9:16 "Music video preview" panel widens to the video's
  16:9 shape while a real video is docked, and returns to the exact mockup
  look when video is unavailable or turned off. If YouTube refuses a video
  (blocked embed), Resona drops back to audio with a toast instead of
  skipping the song.
- **Real credits**: the Credits card is filled from MusicBrainz — main artist,
  performers, writers (composer/lyricist via the linked work), producers,
  engineers, plus album and year. Requests are throttled to MusicBrainz's
  1/sec etiquette, cached 24 h (hits), 30 min (not found) and never cached
  when the lookup itself fails. Unknown tracks keep the honest fallback card
  (artist · album · source/plays).
- **Exactness pass**: all three hero panes (art / video / lyrics) render like
  the mockup with CSS-only visibility switching; shuffle and repeat buttons
  use the mockup's own pressed styling plus toasts; lyrics re-highlight from
  scratch when the pane is opened; the mockup's aria-pressed states, titles
  and close behaviours are matched 1:1.

### Radio / autoplay

- **Start radio** in any track's ⋯ menu: the YouTube Music mix for that song
  becomes your queue (up to 40 tracks, deduped, seed first).
- **Autoplay radio**: when the queue runs out, Resona keeps playing similar
  songs automatically (Settings → Playback → Autoplay radio, on by default;
  honours shuffle and repeat, dedupes against the queue).

### Desktop & distribution

- **macOS builds**: `.dmg` for Apple Silicon and Intel (unsigned —
  right-click → Open on first launch).
- **Linux builds**: `.AppImage` and `.deb` (x64).
- yt-dlp is bundled per-platform (Windows `yt-dlp.exe`, macOS universal
  `yt-dlp_macos`, Linux `yt-dlp`) so direct streams work out of the box.
- **Code-signing pipeline**: add `WINDOWS_CSC_LINK` + `WINDOWS_CSC_KEY_PASSWORD`
  repo secrets and CI signs the Windows installer automatically — no secret,
  no change. `SIGNING.md` documents both routes (free SignPath Foundation for
  open source, or Certum's open-source certificate from ~€25/49).
- CI builds all three platforms in one matrix; artifacts per OS.

### Housekeeping

- Settings migration: `showVideo` flips on once for pre-1.4 installs (the
  button now plays real video); `autoplayRadio` added.
- Version bump 1.3.0 → 1.4.0 (app, desktop, website, update checker).
- 59 unit tests pass; tsc and eslint clean.

## v1.3.0 — mockup implementation release (2026-11-14)

The approved UI mockup (`resona-mockup (5).html`) is now the app. Every screen was
rebuilt against the mockup's stylesheet and DOM structure — the mockup CSS ships
verbatim in `globals.css`, so class names, dimensions, colors and animations match
the design exactly.

### UI (rebuilt on the mockup)

- **Shell**: `.app` grid — 300px sidebar (nav card + Your Library card with filter
  chips), sticky top bar (back/forward, mobile brand, Import playlist pill, avatar
  account menu with backup nudge), full-width player bar, mobile bottom nav.
- **Home**: greeting hero, All/Music/Playlists chips, six quick tiles (Liked songs,
  latest playlist, Recently played, OPM Daily Mix, Downloads, Trending PH),
  "Jump back in" shelf, "Made for you" shelf, "Trending now" chart rows.
- **Search**: mockup search box, browse-all genre tiles in the mockup palette,
  top-result card, Songs table — plus a new "From your library" section that
  surfaces liked/playlist/history/starter tracks matching the query.
- **Library**: Liked / Playlists / History / Downloads tabs with empty states.
- **Playlist**: mockup playlist hero (cover, kicker, name, minutes), play /
  shuffle / ⋯ menu (rename, export JSON, delete — with confirm).
- **Trending**: new full-chart view with region chips (kworb, 81 regions).
- **Settings**: mockup section cards — Appearance (Dark/Light/Auto), Trending
  region, Playback (audio-only/show-video), Audio quality, resolvers, Backup &
  restore (with merge/replace), Starter content, Updates, About.
- **Player bar**: 3-column mockup layout with download-state pill, full-screen
  button, download, lyrics and queue controls; hover-reveal play icons in rows;
  equalizer animation on the playing row.
- **Now playing panel**: Up next / Lyrics tabs, A−/A+ text sizing, karaoke
  lyrics (fill progress, distance blur, tap-to-seek, auto-follow with
  "Sync to song" after manual scroll), mobile full-screen takeover.
- **Full-screen now playing**: art / lyrics / video modes, honest Credits card
  (artist, album, source, plays), "Next in queue" card, dedicated bottom player.
  The real YouTube video docks into the mockup's video slot when
  Settings → Playback → Show video is on.
- **Icons**: the mockup's 24×24 SVG sprite ships as a shared `Icon` component.
- **Toasts**: mockup pill toasts (bottom-centre, check on success) replace sonner.

### Data & behaviour

- **Starter content**: first run seeds the mockup's OPM tracks (Mahal Magmahal,
  Janice, Padaba Taka, Tahanan…), a "Late night" playlist, two likes and a short
  history. Seeds resolve through real `/api/search` — no invented video ids —
  and everything is removable via Settings → Starter content. A library with
  existing data is never overwritten.
- **Downloads**: progress ring on every row + player-bar state pill; honest
  terminal states (saved / no-stream / failed / busy); confirm-before-remove
  for saved audio (offline polish).
- **Lyrics**: real synced lyrics from the existing lrclib route; unsynced and
  no-match states handled honestly.
- **Update check**: hourly silent check against
  `carlsibug98-spec/Resona` GitHub releases; "Update available" in the account
  menu and Settings → Updates; failed/rate-limited checks are reported honestly.
- **Ambient hue**: the canvas gradient follows the playing track's hue (starter
  seeds keep their mockup hue, everything else hashes the videoId).
- **Light mode**: the mockup only swapped card tokens — the main canvas and
  player now follow them too.

### Housekeeping

- Version bump 1.2.1 → 1.3.0 (app + desktop installer).
- README rewritten: what's new, install + SmartScreen bypass steps, how-things-work.
- Removed dead components replaced by the mockup build (FullPlayer, PlayerPanels,
  MobileNowPlaying, TrackCard, EqBars, old TrackMenu/DownloadButton/ProfileMenu/
  ImportDialog); their functions live in the new components.
