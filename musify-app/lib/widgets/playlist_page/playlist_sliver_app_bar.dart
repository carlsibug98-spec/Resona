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

import 'package:material_ui/material_ui.dart';

/// Playlist/album/artist hero — Resona `.phero`: the cover anchors to the
/// bottom-left and the huge title expands over it.
class PlaylistSliverAppBar extends StatelessWidget {
  const PlaylistSliverAppBar({
    super.key,
    required this.title,
    required this.artwork,
    this.leading,
  });

  final String title;
  final Widget artwork;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.sizeOf(context);

    return SliverAppBar(
      leading: leading,
      pinned: true,
      expandedHeight: screenSize.width > screenSize.height ? 360 : 320,
      flexibleSpace: FlexibleSpaceBar(
        centerTitle: true,
        expandedTitleScale: 1.3,
        titlePadding: const EdgeInsetsDirectional.only(
          start: 64,
          end: 64,
          bottom: 16,
        ),
        title: Text(
          title,
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: Theme.of(context).colorScheme.onSurface,
            letterSpacing: -0.03,
            height: 1.1,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        background: Padding(
          padding: const EdgeInsets.only(
            top: 56,
            bottom: 88,
            left: 24,
            right: 24,
          ),
          child: Align(
            alignment: Alignment.bottomLeft,
            child: SizedBox(
              width: 180,
              height: 180,
              child: artwork,
            ),
          ),
        ),
      ),
    );
  }
}
