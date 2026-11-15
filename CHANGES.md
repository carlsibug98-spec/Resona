# Changes

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
