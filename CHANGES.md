# Changes

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
