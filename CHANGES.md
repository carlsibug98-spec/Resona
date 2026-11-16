# Changes

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
