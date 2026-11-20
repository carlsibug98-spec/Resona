/*
 *     Copyright (C) 2026 Valeri Gokadze
 *
 *     Musify is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     Musify is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *
 *     For more information about Musify, including how to contribute,
 *     please visit: https://github.com/gokadzev/Musify
 */

import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:musify/extensions/l10n.dart';
import 'package:musify/services/common_services.dart';
import 'package:musify/services/playlists_manager.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:musify/services/ui_events.dart';
import 'package:musify/theme/resona_ui.dart';
import 'package:musify/utilities/flutter_bottom_sheet.dart'
    show closeCurrentBottomSheet;
import 'package:musify/widgets/mini_player.dart';

/// Resona desktop shell: a 56px top bar across the window, a 300px sidebar
/// with the brand + "Your Library" card, the content inside a rounded
/// #121212 panel, and the 80px player bar pinned at the bottom — the exact
/// grid of Resona's `.app` layout (56 / content / 80 with 8px gaps).
class BottomNavigationPage extends StatefulWidget {
  const BottomNavigationPage({required this.child, super.key});

  final StatefulNavigationShell child;

  @override
  State<BottomNavigationPage> createState() => _BottomNavigationPageState();
}

class _BottomNavigationPageState extends State<BottomNavigationPage> {
  bool? _previousOfflineMode;

  /// Track the previously selected shell branch to detect reselects.
  int? _previousShellIndex;

  /// User-pinned sidebar collapse, on top of the width-driven one.
  bool _sidebarCollapsed = false;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: widget.child.currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;

        final currentIndex = widget.child.currentIndex;
        if (currentIndex != 0) {
          widget.child.goBranch(0);
        } else {
          SystemNavigator.pop();
        }
      },
      child: ValueListenableBuilder<bool>(
        valueListenable: offlineMode,
        builder: (context, isOfflineMode, _) {
          if (_previousOfflineMode != null &&
              _previousOfflineMode != isOfflineMode) {
            SchedulerBinding.instance.addPostFrameCallback((_) {
              _handleOfflineModeChange(isOfflineMode);
            });
          }
          _previousOfflineMode = isOfflineMode;

          void goBranch(int index) => _onTabTapped(index);

          // Resona grid: top bar / [sidebar | main] / player bar with 8px
          // gaps. SafeArea only reserves room on platforms that have
          // notches or system bars (desktop insets are all zero). The whole
          // shell paints the app background so no platform-default white
          // bleeds through around the cards.
          return ColoredBox(
            color: Theme.of(context).scaffoldBackgroundColor,
            child: SafeArea(
              left: false,
              right: false,
              child: Column(
                children: [
                  _ResonaTopBar(
                    currentShellIndex: widget.child.currentIndex,
                    isOffline: isOfflineMode,
                    goBranch: goBranch,
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        // Resona collapses the sidebar under 760px; the user
                        // can also pin it collapsed from the library header.
                        final widthDriven = constraints.maxWidth < 760;
                        final collapsed = widthDriven || _sidebarCollapsed;
                        return Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _ResonaSideNav(
                              currentShellIndex: widget.child.currentIndex,
                              collapsed: collapsed,
                              widthDriven: widthDriven,
                              isOffline: isOfflineMode,
                              goBranch: goBranch,
                              onSetCollapsed: (value) =>
                                  setState(() => _sidebarCollapsed = value),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerLow,
                                  borderRadius: BorderRadius.circular(
                                    ResonaColors.radius,
                                  ),
                                ),
                                clipBehavior: Clip.antiAlias,
                                child: widget.child,
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 8),
                  // player bar spans the full width, like Resona row 3;
                  // it renders nothing while no track is loaded
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8, left: 8),
                    child: MiniPlayer(),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _handleOfflineModeChange(bool isOfflineMode) {
    if (!mounted) return;

    final currentRoute = GoRouterState.of(context).matchedLocation;

    // If we're switching to offline mode and currently on search tab
    if (isOfflineMode && currentRoute.startsWith('/search')) {
      // Navigate to home
      widget.child.goBranch(0);
    }
  }

  void _onTabTapped(int shellIndex) {
    final isReselect = _previousShellIndex == shellIndex;

    // Close any open bottom sheet before switching tabs
    closeCurrentBottomSheet();

    // If user taps the same tab again, reset it to initial state.
    // Otherwise, preserve the branch state.
    if (isReselect) {
      widget.child.goBranch(shellIndex, initialLocation: true);
    } else {
      widget.child.goBranch(shellIndex);
    }

    _previousShellIndex = shellIndex;
    if (mounted) setState(() {});
  }
}

// ─────────────────────────── top bar ──────────────────────────────────────

/// Resona `.top`: 56px row — home circle button, centered search pill,
/// settings avatar on the right. The whole row is drag-friendly on desktop.
class _ResonaTopBar extends StatelessWidget {
  const _ResonaTopBar({
    required this.currentShellIndex,
    required this.isOffline,
    required this.goBranch,
  });

  final int currentShellIndex;
  final bool isOffline;
  final void Function(int shellIndex) goBranch;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final onHome = currentShellIndex == 0;

    return SizedBox(
      height: 56,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            // home button — green disc while Home is active
            _HomeButton(
              active: onHome,
              colorScheme: colorScheme,
              onTap: () => goBranch(0),
            ),
            const SizedBox(width: 12),
            // centered search pill
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 708),
                  child: _SearchPill(
                    isOffline: isOffline,
                    colorScheme: colorScheme,
                    goBranch: goBranch,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            // settings avatar
            _SettingsAvatar(colorScheme: colorScheme, goBranch: goBranch),
          ],
        ),
      ),
    );
  }
}

class _HomeButton extends StatelessWidget {
  const _HomeButton({
    required this.active,
    required this.colorScheme,
    required this.onTap,
  });

  final bool active;
  final ColorScheme colorScheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Tooltip(
        message: context.l10n?.home ?? 'Home',
        child: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: active ? colorScheme.primary : Colors.transparent,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Icon(
              FluentIcons.home_24_regular,
              size: 20,
              color: active ? ResonaColors.onBrand : colorScheme.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _SearchPill extends StatelessWidget {
  const _SearchPill({
    required this.isOffline,
    required this.colorScheme,
    required this.goBranch,
  });

  final bool isOffline;
  final ColorScheme colorScheme;
  final void Function(int shellIndex) goBranch;

  @override
  Widget build(BuildContext context) {
    if (isOffline) return const SizedBox.shrink();

    return GestureDetector(
      onTap: () {
        searchFocusRequest.value++;
        goBranch(1);
      },
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          children: [
            Icon(
              FluentIcons.search_24_regular,
              size: 18,
              color: colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                context.l10n?.search != null
                    ? '${context.l10n!.search}...'
                    : 'What do you want to play?',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: colorScheme.onSurfaceVariant,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsAvatar extends StatelessWidget {
  const _SettingsAvatar({required this.colorScheme, required this.goBranch});

  final ColorScheme colorScheme;
  final void Function(int shellIndex) goBranch;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => goBranch(3),
      child: Tooltip(
        message: context.l10n?.settings ?? 'Settings',
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: colorScheme.outlineVariant),
            color: colorScheme.surfaceContainerHigh,
          ),
          child: Center(
            child: Icon(
              FluentIcons.settings_24_regular,
              size: 18,
              color: colorScheme.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── sidebar ──────────────────────────────────────

/// Resona sidebar: brand row + the "Your Library" card with filter chips
/// and library rows. Collapses to a strip of covers under 760px or when
/// pinned from the header; the width animates so window resizes stay smooth.
class _ResonaSideNav extends StatelessWidget {
  const _ResonaSideNav({
    required this.currentShellIndex,
    required this.collapsed,
    required this.widthDriven,
    required this.isOffline,
    required this.goBranch,
    required this.onSetCollapsed,
  });

  final int currentShellIndex;
  final bool collapsed;

  /// Whether the collapsed state comes from the window width — then the
  /// expand affordance is pointless and stays hidden.
  final bool widthDriven;
  final bool isOffline;
  final void Function(int shellIndex) goBranch;
  final ValueChanged<bool> onSetCollapsed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return ClipRect(
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        width: collapsed ? 84 : 300,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // brand row
            GestureDetector(
              onTap: () => goBranch(0),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 8, 4),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: const BoxDecoration(
                        // brand chip: the bundled wordmark glyph is white,
                        // so it needs the green chip behind it to stay
                        // visible
                        color: ResonaColors.brand,
                        shape: BoxShape.circle,
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Image.asset(
                        'assets/icons/musify_icon.png',
                        fit: BoxFit.cover,
                      ),
                    ),
                    if (!collapsed) ...[
                      const SizedBox(width: 10),
                      Text(
                        'Musify',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.02,
                          color: colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            // your library card
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: colorScheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(ResonaColors.radius),
                ),
                child: collapsed
                    ? _CollapsedLibrary(
                        colorScheme: colorScheme,
                        widthDriven: widthDriven,
                        onExpand: () => onSetCollapsed(false),
                      )
                    : _LibraryCard(
                        colorScheme: colorScheme,
                        goBranch: goBranch,
                        onCollapse: () => onSetCollapsed(true),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LibraryCard extends StatelessWidget {
  const _LibraryCard({
    required this.colorScheme,
    required this.goBranch,
    required this.onCollapse,
  });

  final ColorScheme colorScheme;
  final void Function(int shellIndex) goBranch;
  final VoidCallback onCollapse;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // header
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
          child: Row(
            children: [
              Icon(
                FluentIcons.library_24_regular,
                size: 18,
                color: colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  context.l10n?.library ?? 'Your Library',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colorScheme.onSurfaceVariant,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              // pin the sidebar collapsed, like Resona's panel toggle
              IconButton(
                onPressed: onCollapse,
                visualDensity: VisualDensity.compact,
                tooltip: 'Collapse sidebar',
                icon: Icon(
                  FluentIcons.chevron_left_24_regular,
                  size: 18,
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
              IconButton(
                onPressed: () => goBranch(2),
                visualDensity: VisualDensity.compact,
                icon: Icon(
                  FluentIcons.add_24_regular,
                  size: 18,
                  color: colorScheme.onSurfaceVariant,
                ),
                tooltip: context.l10n?.library ?? 'Library',
              ),
            ],
          ),
        ),
        // rows
        Expanded(
          child: _LibraryRows(colorScheme: colorScheme, goBranch: goBranch),
        ),
      ],
    );
  }
}

class _LibraryRows extends StatelessWidget {
  const _LibraryRows({required this.colorScheme, required this.goBranch});

  final ColorScheme colorScheme;
  final void Function(int shellIndex) goBranch;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<List<Map>>(
      valueListenable: userCustomPlaylists,
      builder: (context, customPlaylists, _) {
        return ValueListenableBuilder<List<Map>>(
          valueListenable: userLikedPlaylists,
          builder: (context, likedPlaylists, _) {
            return ValueListenableBuilder<List>(
              valueListenable: userOfflineSongs,
              builder: (context, offlineSongs, _) {
                return ValueListenableBuilder<bool>(
                  valueListenable: offlineMode,
                  builder: (context, isOff, _) {
                    final rows = <_LibRowData>[];

                    if (!isOff && likedPlaylists.isNotEmpty) {
                      rows.add(
                        _LibRowData(
                          title: context.l10n?.likedPlaylists ?? 'Liked',
                          subtitle: 'Playlist · ${likedPlaylists.length} items',
                          like: true,
                          onTap: () => goBranch(2),
                        ),
                      );
                    }

                    for (final playlist in customPlaylists) {
                      final songs = (playlist['list'] as List?)?.length ?? 0;
                      rows.add(
                        _LibRowData(
                          title: playlist['title']?.toString() ?? 'Playlist',
                          subtitle: 'Playlist · $songs songs',
                          hue: resonaHue(
                            playlist['ytid']?.toString() ??
                                playlist['title']?.toString() ??
                                '',
                          ),
                          onTap: () {
                            final ytid = playlist['ytid']?.toString();
                            if (ytid == null || ytid.isEmpty) return;
                            context.push('/home/playlist/$ytid');
                          },
                        ),
                      );
                    }

                    if (offlineSongs.isNotEmpty) {
                      rows.add(
                        _LibRowData(
                          title: context.l10n?.offlineMode ?? 'Offline songs',
                          subtitle: '${offlineSongs.length} saved offline',
                          download: true,
                          onTap: () => goBranch(2),
                        ),
                      );
                    }

                    if (rows.isEmpty) {
                      return Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          context.l10n?.noPlaylistsAdded ?? 'Nothing here yet. Like a song or create a playlist.',
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.5,
                            color: colorScheme.onSurfaceVariant,
                          ),
                        ),
                      );
                    }

                    return ListView.builder(
                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                      itemCount: rows.length,
                      itemBuilder: (context, index) =>
                          _LibRow(data: rows[index], colorScheme: colorScheme),
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  }
}

class _LibRowData {
  const _LibRowData({
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.hue,
    this.like = false,
    this.download = false,
  });

  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final int? hue;
  final bool like;
  final bool download;
}

/// Resona `.row-lib`: 48px mini cover + bold name + muted subtitle.
class _LibRow extends StatelessWidget {
  const _LibRow({required this.data, required this.colorScheme});

  final _LibRowData data;
  final ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: data.onTap,
        borderRadius: BorderRadius.circular(ResonaColors.radius),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              _MiniCover(data: data, colorScheme: colorScheme),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      data.title,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: colorScheme.onSurface,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      data.subtitle,
                      style: TextStyle(
                        fontSize: 12,
                        color: colorScheme.onSurfaceVariant,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MiniCover extends StatelessWidget {
  const _MiniCover({required this.data, required this.colorScheme});

  final _LibRowData data;
  final ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    const double size = 48;

    if (data.like) {
      // liked: brand gradient + filled heart
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [colorScheme.primary, colorScheme.primary],
          ),
          borderRadius: BorderRadius.circular(8),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: const Icon(
          FluentIcons.heart_24_filled,
          size: 20,
          color: ResonaColors.onBrand,
        ),
      );
    }

    if (data.download) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          FluentIcons.arrow_download_24_regular,
          size: 20,
          color: colorScheme.primary,
        ),
      );
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: resonaPlGrad(data.hue ?? 18),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Center(
        child: Text(
          data.title.isEmpty ? '' : data.title[0].toUpperCase(),
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: Color(0xE6FFFFFF),
          ),
        ),
      ),
    );
  }
}

class _CollapsedLibrary extends StatelessWidget {
  const _CollapsedLibrary({
    required this.colorScheme,
    required this.widthDriven,
    required this.onExpand,
  });

  final ColorScheme colorScheme;
  final bool widthDriven;
  final VoidCallback onExpand;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<List<Map>>(
      valueListenable: userCustomPlaylists,
      builder: (context, customPlaylists, _) {
        return ValueListenableBuilder<List<Map>>(
          valueListenable: userLikedPlaylists,
          builder: (context, likedPlaylists, _) {
            return ValueListenableBuilder<bool>(
              valueListenable: offlineMode,
              builder: (context, isOff, _) {
                return ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    // expand affordance — only when the collapse was pinned
                    // by the user, not forced by the window width
                    if (!widthDriven)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Center(
                          child: IconButton(
                            onPressed: onExpand,
                            visualDensity: VisualDensity.compact,
                            tooltip: 'Expand sidebar',
                            icon: Icon(
                              FluentIcons.chevron_right_24_regular,
                              size: 18,
                              color: colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                      ),
                    for (final playlist in customPlaylists.take(6))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: GestureDetector(
                          onTap: () {
                            final ytid = playlist['ytid']?.toString();
                            if (ytid == null || ytid.isEmpty) return;
                            context.push('/home/playlist/$ytid');
                          },
                          child: _MiniCover(
                            data: _LibRowData(
                              title: playlist['title']?.toString() ?? 'P',
                              subtitle: '',
                              hue: resonaHue(
                                playlist['ytid']?.toString() ?? '',
                              ),
                              onTap: () {},
                            ),
                            colorScheme: colorScheme,
                          ),
                        ),
                      ),
                    if (!isOff && likedPlaylists.isNotEmpty)
                      _MiniCover(
                        data: const _LibRowData(
                          title: 'Liked',
                          subtitle: '',
                          like: true,
                          onTap: null,
                        ),
                        colorScheme: colorScheme,
                      ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }
}
