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

import 'package:audio_service/audio_service.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:material_ui/material_ui.dart';
import 'package:musify/main.dart';
import 'package:musify/models/full_player_state.dart';
import 'package:musify/models/position_data.dart';
import 'package:musify/screens/now_playing_page.dart';
import 'package:musify/services/common_services.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:musify/theme/resona_ui.dart';
import 'package:musify/utilities/formatter.dart';
import 'package:musify/utilities/mediaitem.dart';
import 'package:musify/widgets/marquee.dart';
import 'package:musify/widgets/song_artwork.dart';
import 'package:rxdart/rxdart.dart';

final Stream<FullPlayerState> _fullPlayerStateStream =
    Rx.combineLatest3(
          audioHandler.playbackStateStream,
          audioHandler.queue.distinct(),
          audioHandler.positionDataStream,
          (PlaybackState state, List<MediaItem> queue, PositionData pos) =>
              FullPlayerState(
                playbackState: state,
                queue: queue,
                position: pos,
              ),
        )
        .throttleTime(const Duration(milliseconds: 120), trailing: true)
        .asBroadcastStream();

/// Resona-style player bar: 80px tall, three zones — track info, centered
/// controls with the seek line underneath, and like / volume on the right.
/// Ported from Resona's `.player` / `.np` / `.btns` / `.seek` styles.
class MiniPlayer extends StatelessWidget {
  const MiniPlayer({super.key});

  static const double playerHeight = 80;
  static const double _borderRadius = ResonaColors.radius;
  static const double _artworkSize = 44;
  static const double _artworkRadius = 8;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<MediaItem?>(
      stream: audioHandler.mediaItem,
      builder: (context, mediaSnapshot) {
        final metadata = mediaSnapshot.data;
        if (metadata == null) return const SizedBox.shrink();

        return StreamBuilder<FullPlayerState>(
          stream: _fullPlayerStateStream,
          builder: (context, stateSnapshot) {
            final state = stateSnapshot.data;
            if (state == null) return const SizedBox.shrink();

            final hasNext =
                state.queue.length > 1 &&
                (state.playbackState.queueIndex ?? 0) <
                    state.queue.length - 1;

            return _PlayerBarBody(
              metadata: metadata,
              state: state,
              hasNext: hasNext,
            );
          },
        );
      },
    );
  }
}

class _PlayerBarBody extends StatefulWidget {
  const _PlayerBarBody({
    required this.metadata,
    required this.state,
    required this.hasNext,
  });

  final MediaItem metadata;
  final FullPlayerState state;
  final bool hasNext;

  @override
  State<_PlayerBarBody> createState() => _PlayerBarBodyState();
}

class _PlayerBarBodyState extends State<_PlayerBarBody> {
  static const _dragThresholdForNavigation = 10;

  void _handleVerticalDrag(DragUpdateDetails details) {
    if ((details.primaryDelta ?? 0) < -_dragThresholdForNavigation) {
      _navigateToNowPlaying();
    }
  }

  void _navigateToNowPlaying() {
    Navigator.of(context).push(_createSlideTransition());
  }

  PageRoute<void> _createSlideTransition() {
    return PageRouteBuilder<void>(
      pageBuilder: (context, animation, _) => const NowPlayingPage(),
      reverseTransitionDuration: const Duration(milliseconds: 250),
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        final tween = Tween(
          begin: const Offset(0, 1),
          end: Offset.zero,
        ).chain(CurveTween(curve: Curves.easeInOut));
        return SlideTransition(position: animation.drive(tween), child: child);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final metadata = widget.metadata;
    final state = widget.state;
    final colorScheme = Theme.of(context).colorScheme;
    final isWide = MediaQuery.sizeOf(context).width >= 900;

    return GestureDetector(
      onVerticalDragUpdate: _handleVerticalDrag,
      child: Container(
        height: MiniPlayer.playerHeight,
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(MiniPlayer._borderRadius),
          border: Border.all(color: colorScheme.outlineVariant),
        ),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: Row(
            children: [
              // ── now playing ──
              _NowPlayingInfo(
                metadata: metadata,
                onOpen: _navigateToNowPlaying,
              ),
              const Spacer(),
              // ── controls + seek ──
              _CenterControls(
                metadata: metadata,
                state: state,
                hasNext: widget.hasNext,
              ),
              const Spacer(),
              // ── like / volume ──
              if (isWide)
                _RightControls(metadata: metadata)
              else
                const SizedBox.shrink(),
            ],
          ),
        ),
      ),
    );
  }
}

class _NowPlayingInfo extends StatelessWidget {
  const _NowPlayingInfo({required this.metadata, required this.onOpen});

  final MediaItem metadata;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: onOpen,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 220,
        child: Row(
          children: [
            Hero(
              tag: 'now_playing_artwork',
              child: SongArtworkWidget(
                metadata: metadata,
                size: MiniPlayer._artworkSize,
                errorWidgetIconSize: 20,
                borderRadius: MiniPlayer._artworkRadius,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  MarqueeWidget(
                    manualScrollEnabled: false,
                    animationDuration: const Duration(seconds: 8),
                    backDuration: const Duration(seconds: 2),
                    pauseDuration: const Duration(seconds: 2),
                    child: Text(
                      metadata.title,
                      style: TextStyle(
                        color: colorScheme.onSurface,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (metadata.artist?.isNotEmpty ?? false) ...[
                    const SizedBox(height: 2),
                    Text(
                      metadata.artist!,
                      style: TextStyle(
                        color: colorScheme.onSurfaceVariant,
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CenterControls extends StatelessWidget {
  const _CenterControls({
    required this.metadata,
    required this.state,
    required this.hasNext,
  });

  final MediaItem metadata;
  final FullPlayerState state;
  final bool hasNext;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 620),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // transport buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _ShuffleButton(colorScheme: colorScheme),
              _IconControlButton(
                icon: FluentIcons.previous_24_filled,
                colorScheme: colorScheme,
                onPressed: audioHandler.hasPrevious
                    ? () => audioHandler.skipToPrevious()
                    : null,
              ),
              _PlayButton(state: state, colorScheme: colorScheme),
              _IconControlButton(
                icon: FluentIcons.next_24_filled,
                colorScheme: colorScheme,
                onPressed: hasNext ? audioHandler.skipToNext : null,
              ),
              _RepeatButton(colorScheme: colorScheme),
            ],
          ),
          const SizedBox(height: 2),
          // seek line
          _SeekLine(
            state: state,
            metadata: metadata,
            colorScheme: colorScheme,
          ),
        ],
      ),
    );
  }
}

class _ShuffleButton extends StatelessWidget {
  const _ShuffleButton({required this.colorScheme});

  final ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: shuffleNotifier,
      builder: (_, shuffled, __) => _IconControlButton(
        icon: shuffled
            ? FluentIcons.arrow_shuffle_24_filled
            : FluentIcons.arrow_shuffle_off_24_regular,
        colorScheme: colorScheme,
        isActive: shuffled,
        onPressed: () => audioHandler.setShuffleMode(
          shuffled
              ? AudioServiceShuffleMode.none
              : AudioServiceShuffleMode.all,
        ),
      ),
    );
  }
}

class _RepeatButton extends StatelessWidget {
  const _RepeatButton({required this.colorScheme});

  final ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<AudioServiceRepeatMode>(
      valueListenable: repeatNotifier,
      builder: (_, mode, __) {
        final IconData icon;
        switch (mode) {
          case AudioServiceRepeatMode.one:
            icon = FluentIcons.arrow_repeat_1_24_filled;
          case AudioServiceRepeatMode.all:
          case AudioServiceRepeatMode.group:
            icon = FluentIcons.arrow_repeat_all_24_filled;
          default:
            icon = FluentIcons.arrow_repeat_all_off_24_regular;
        }
        return _IconControlButton(
          icon: icon,
          colorScheme: colorScheme,
          isActive: mode != AudioServiceRepeatMode.none,
          onPressed: () {
            final AudioServiceRepeatMode newMode;
            if (mode == AudioServiceRepeatMode.none) {
              newMode = AudioServiceRepeatMode.all;
            } else if (mode == AudioServiceRepeatMode.all) {
              newMode = AudioServiceRepeatMode.one;
            } else {
              newMode = AudioServiceRepeatMode.none;
            }
            repeatNotifier.value = newMode;
            audioHandler.setRepeatMode(newMode);
          },
        );
      },
    );
  }
}

class _IconControlButton extends StatelessWidget {
  const _IconControlButton({
    required this.icon,
    required this.colorScheme,
    required this.onPressed,
    this.isActive = false,
  });

  final IconData icon;
  final ColorScheme colorScheme;
  final VoidCallback? onPressed;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      icon: Icon(
        icon,
        color: onPressed == null
            ? colorScheme.onSurfaceVariant.withValues(alpha: 0.45)
            : isActive
            ? colorScheme.primary
            : colorScheme.onSurfaceVariant,
        size: 22,
      ),
      visualDensity: VisualDensity.compact,
    );
  }
}

/// Resona `.playbtn`: 34px white disc, black glyph, subtle press scale.
class _PlayButton extends StatelessWidget {
  const _PlayButton({required this.state, required this.colorScheme});

  final FullPlayerState state;
  final ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    final processingState = state.playbackState.processingState;
    final isPlaying = state.playbackState.playing;
    final isLoading =
        processingState == AudioProcessingState.loading ||
        processingState == AudioProcessingState.buffering;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: GestureDetector(
        onTap: () => (isPlaying ? audioHandler.pause : audioHandler.play)(),
        child: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: colorScheme.onSurface,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: isLoading
                ? SizedBox(
                    width: 15,
                    height: 15,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: colorScheme.onPrimary,
                    ),
                  )
                : Icon(
                    isPlaying
                        ? FluentIcons.pause_24_filled
                        : FluentIcons.play_24_filled,
                    color: colorScheme.onPrimary,
                    size: isPlaying ? 14 : 15,
                  ),
          ),
        ),
      ),
    );
  }
}

/// Resona `.seek` / `.bar`: elapsed — 4px line with brand fill — duration.
class _SeekLine extends StatefulWidget {
  const _SeekLine({
    required this.state,
    required this.metadata,
    required this.colorScheme,
  });

  final FullPlayerState state;
  final MediaItem metadata;
  final ColorScheme colorScheme;

  @override
  State<_SeekLine> createState() => _SeekLineState();
}

class _SeekLineState extends State<_SeekLine> {
  bool _dragging = false;
  double _dragFraction = 0;

  @override
  Widget build(BuildContext context) {
    final positionData = widget.state.position;
    final totalDuration = positionData.duration > Duration.zero
        ? positionData.duration
        : (widget.metadata.duration ?? Duration.zero);
    final colorScheme = widget.colorScheme;

    final current = _dragging
        ? _dragFraction
        : totalDuration.inMilliseconds == 0
        ? 0.0
        : (positionData.position.inMilliseconds /
                  totalDuration.inMilliseconds)
              .clamp(0.0, 1.0);

    void seekToFraction(double fraction) {
      if (totalDuration.inMilliseconds == 0) return;
      audioHandler.seek(
        Duration(milliseconds: (fraction * totalDuration.inMilliseconds).round()),
      );
    }

    return SizedBox(
      height: 20,
      child: Row(
        children: [
          Text(
            formatDuration(
              (_dragging
                      ? Duration(
                          milliseconds:
                              (_dragFraction * totalDuration.inMilliseconds)
                                  .round(),
                        )
                      : positionData.position)
                  .inSeconds,
            ),
            style: TextStyle(
              fontSize: 11,
              color: colorScheme.onSurfaceVariant,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                void handleLocalOffset(Offset local) {
                  final fraction = (local.dx / constraints.maxWidth).clamp(
                    0.0,
                    1.0,
                  );
                  setState(() {
                    _dragging = true;
                    _dragFraction = fraction;
                  });
                }

                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTapDown: (details) {
                    handleLocalOffset(details.localPosition);
                    seekToFraction(_dragFraction);
                  },
                  onHorizontalDragStart: (details) =>
                      handleLocalOffset(details.localPosition),
                  onHorizontalDragUpdate: (details) {
                    final fraction = ((details.localPosition.dx) /
                            constraints.maxWidth)
                        .clamp(0.0, 1.0);
                    setState(() {
                      _dragging = true;
                      _dragFraction = fraction;
                    });
                    seekToFraction(fraction);
                  },
                  onHorizontalDragEnd: (_) => setState(() {
                    _dragging = false;
                  }),
                  child: Stack(
                    alignment: Alignment.centerLeft,
                    children: [
                      Container(
                        height: _dragging ? 6 : 4,
                        decoration: BoxDecoration(
                          color: colorScheme.outlineVariant,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      FractionallySizedBox(
                        widthFactor: current,
                        child: Container(
                          height: _dragging ? 6 : 4,
                          decoration: BoxDecoration(
                            color: colorScheme.primary,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ),
                      if (_dragging)
                        Positioned(
                          left:
                              (current * constraints.maxWidth - 5).clamp(
                                0.0,
                                constraints.maxWidth - 10,
                              ),
                          child: Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: colorScheme.onSurface,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(width: 10),
          Text(
            formatDuration(totalDuration.inSeconds),
            style: TextStyle(
              fontSize: 11,
              color: colorScheme.onSurfaceVariant,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _RightControls extends StatelessWidget {
  const _RightControls({required this.metadata});

  final MediaItem metadata;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final ytid = metadata.extras?['ytid']?.toString() ?? '';

    return SizedBox(
      width: 220,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          if (ytid.isNotEmpty && !offlineMode.value)
            ValueListenableBuilder<List>(
              valueListenable: userLikedSongsList,
              builder: (_, __, ___) {
                final liked = isSongAlreadyLiked(ytid);
                return IconButton(
                  onPressed: () {
                    updateSongLikeStatus(
                      ytid,
                      !liked,
                      songData: mediaItemToMap(metadata),
                    );
                  },
                  splashColor: Colors.transparent,
                  highlightColor: Colors.transparent,
                  icon: Icon(
                    liked
                        ? FluentIcons.heart_24_filled
                        : FluentIcons.heart_24_regular,
                    color: liked
                        ? colorScheme.primary
                        : colorScheme.onSurfaceVariant,
                    size: 22,
                  ),
                  visualDensity: VisualDensity.compact,
                );
              },
            ),
          const VolumeControl(),
        ],
      ),
    );
  }
}

/// Resona `.vol`: mute icon + thin range line.
class VolumeControl extends StatelessWidget {
  const VolumeControl({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return StreamBuilder<double>(
      stream: audioHandler.volumeStream,
      builder: (context, snapshot) {
        final volume = snapshot.data ?? audioHandler.volume;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              onPressed: () =>
                  audioHandler.setVolume(volume > 0 ? 0.0 : 1.0),
              splashColor: Colors.transparent,
              highlightColor: Colors.transparent,
              icon: Icon(
                volume <= 0.001
                    ? FluentIcons.speaker_mute_24_regular
                    : FluentIcons.speaker_2_24_regular,
                color: colorScheme.onSurfaceVariant,
                size: 22,
              ),
              visualDensity: VisualDensity.compact,
            ),
            SizedBox(
              width: 90,
              child: SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  trackHeight: 4,
                  thumbShape: const RoundSliderThumbShape(
                    enabledThumbRadius: 6,
                  ),
                  overlayShape: const RoundSliderOverlayShape(
                    overlayRadius: 14,
                  ),
                ),
                child: Slider(
                  value: volume.clamp(0.0, 1.0),
                  onChanged: audioHandler.setVolume,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
