# Musify — Resona UI edition

This folder is [gokadzev/Musify](https://github.com/gokadzev/Musify)
(upstream `v10.7.1`, GPL-3.0) with **Resona's desktop UI design implemented
on top of it**. Every feature of Musify still works — YouTube Music
streaming, offline downloads, playlists, local sync, listening stats,
equalizer — the presentation layer was rebuilt to match
[Resona](https://github.com/carlsibug98-spec/Resona).

## What changed vs upstream

Ported from Resona's `globals.css` design system (black background,
`#121212` surfaces, `#1F1F1F` elevation, white 10% hairlines, `#B3B3B3`
muted text, `#1ED760` brand green, 10px radius):

| Area | File(s) | Change |
| --- | --- | --- |
| Design tokens | `lib/theme/resona_ui.dart` (new) | Resona palette, `hueFor()` stable per-item hue, `plGrad`/`grad` gradients, npp glow colors |
| Theme | `lib/theme/app_themes.dart` | Full Resona re-theme: surfaces, pill buttons, chips, dialogs, menus, inputs, tooltips, snackbars |
| Accent | `lib/services/settings_manager.dart`, `lib/theme/app_colors.dart` | Default accent is now Resona Green `#1ED760` |
| Shell | `lib/screens/bottom_navigation_page.dart` | Resona `.app` grid: 56px top bar (home disc + centered search pill + settings avatar), 300px sidebar (brand row + "Your Library" card with chips & rows, collapses < 760px), content in a rounded `#121212` panel, player bar docked at the bottom |
| Player bar | `lib/widgets/mini_player.dart` | Resona `.player`: 80px, 3 zones — track info / transport + seek line / like + volume (wide screens) |
| Track rows | `lib/widgets/song_bar.dart` | Resona `.trow`: transparent rows, 44px/6px covers, compact padding |
| Covers | `lib/widgets/playlist_cube.dart` | Resona `.cov`: deep drop shadow + bottom wash + frosted label |
| Search | `lib/widgets/custom_search_bar.dart`, `lib/screens/search_page.dart` | `.sbox` focus ring, genre browse grid (`.genre`) with stable hue gradients |
| Home | `lib/screens/home_page.dart` | Hero heading + `.qtile` quick tiles grid on wide screens |
| Playlist hero | `lib/widgets/playlist_page/playlist_sliver_app_bar.dart`, `playlist_header.dart` | `.phero`: bottom-left 180px cover, huge `w800 -0.03em` title |
| Now playing | `lib/screens/now_playing_page.dart` | `.npp-bg`: layered radial hue glows over near-black with dark scrim |
| Misc | section headers (`.section-h`), chips (`.chip`), announcements (`.nudge`), bar radius constants | Restyled to Resona tokens |

## Verify locally

```bash
cd musify-app
flutter pub get
flutter analyze   # clean
flutter test      # 222 passing; the 3 network/multicast tests need real internet
flutter run       # android / windows / linux
```

`flutter build web` needs the same 2-line patch to
`lib/services/linux_media_controls.dart` upstream Musify needs (the file
targets Linux desktop only).

## License

GPL-3.0, same as upstream Musify and Resona. All upstream copyright notices
are retained in every modified file. © Valeri Gokadze for the original
Musify code; UI redesign ported from Resona.
