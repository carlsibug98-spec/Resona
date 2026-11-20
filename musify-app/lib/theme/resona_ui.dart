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

/// Resona UI design tokens.
///
/// Ported 1:1 from Resona's `globals.css` mockup stylesheet so the Flutter
/// app carries the exact same surfaces, lines, text colors and accent as the
/// approved Resona design. Dark is the source of truth; light mirrors it.
abstract final class ResonaColors {
  // ── brand ────────────────────────────────────────────────────────────
  static const brand = Color(0xFF1ED760);
  static const brandHover = Color(0xFF25E56B);
  static const onBrand = Color(0xFF0A0A0C);
  static const danger = Color(0xFFF87171);

  // ── dark theme ───────────────────────────────────────────────────────
  static const bgDark = Color(0xFF000000);
  static const surfaceDark = Color(0xFF121212);
  static const elevDark = Color(0xFF1F1F1F);
  static const textDark = Color(0xFFFFFFFF);
  static const mutedDark = Color(0xFFB3B3B3);
  static const lineDark = Color(0x1AFFFFFF); // rgba(255,255,255,.10)
  static const hoverDark = Color(0x14FFFFFF); // rgba(255,255,255,.08)

  // ── light theme ──────────────────────────────────────────────────────
  static const bgLight = Color(0xFFF3F3F5);
  static const surfaceLight = Color(0xFFFFFFFF);
  static const elevLight = Color(0xFFF0F0F3);
  static const textLight = Color(0xFF0C0C10);
  static const mutedLight = Color(0xFF65656F);
  static const lineLight = Color(0x14000000); // rgba(0,0,0,.08)
  static const hoverLight = Color(0x0D000000); // rgba(0,0,0,.05)

  // ── now-playing panel (`.npp-bg`) ────────────────────────────────
  /// `.npp-bg` base under the radial glows.
  static const nppBaseDark = Color(0xFF0D0D10);
  static const nppBaseLight = Color(0xFFEDEDF2);

  /// `.npp::after` scrim that washes the glows out.
  static const nppScrimDark = Color(0x5908080C);
  static const nppScrimLight = Color(0x2EFFFFFF);

  /// global radius token `--r`
  static const radius = 10.0;

  /// card / menu radius (`.card-item`, `.menu`, `.sdrop`)
  static const radiusLg = 12.0;
}

/// Stable hue from a name — Resona's `hueFor(name)` in catalog-utils.ts:
/// `h = (h * 31 + code) % 100000`, hue = `h % 360`. Used for per-item cover
/// gradients so the same item always gets the same colors, like Resona.
int resonaHue(String name) {
  var h = 0;
  for (final code in name.codeUnits) {
    h = (h * 31 + code) % 100000;
  }
  return h % 360;
}

/// Resona `plGrad(hue)`: `linear-gradient(135deg, hsl(h 70% 46%),
/// hsl((h + 90) % 360 55% 16%))` as a Flutter gradient (top-left → bottom-
/// right).
Gradient resonaPlGrad(int hue) {
  final start = HSLColor.fromAHSL(1, hue.toDouble(), 0.7, 0.46).toColor();
  final end = HSLColor.fromAHSL(
    1,
    ((hue + 90) % 360).toDouble(),
    0.55,
    0.16,
  ).toColor();
  return LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [start, end],
  );
}

/// Resona `grad(hue)`: `linear-gradient(135deg, hsl(h 70% 48%),
/// hsl((h + 50) % 360 60% 14%))`.
Gradient resonaGrad(int hue) {
  final start = HSLColor.fromAHSL(1, hue.toDouble(), 0.7, 0.48).toColor();
  final end = HSLColor.fromAHSL(
    1,
    ((hue + 50) % 360).toDouble(),
    0.6,
    0.14,
  ).toColor();
  return LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [start, end],
  );
}

/// Two radial stops used by Resona's now-playing panel background
/// (`.npp-bg`): hue at 70/42 and hue+60 at 65/32. With [light] the stops
/// become pastel washes over the light base instead.
Color resonaGlowA(int hue, {bool light = false}) => light
    ? HSLColor.fromAHSL(0.85, hue.toDouble(), 0.65, 0.85).toColor()
    : HSLColor.fromAHSL(0.75, hue.toDouble(), 0.7, 0.42).toColor();

Color resonaGlowB(int hue, {bool light = false}) => light
    ? HSLColor.fromAHSL(0.8, ((hue + 60) % 360).toDouble(), 0.6, 0.82).toColor()
    : HSLColor.fromAHSL(
        0.7,
        ((hue + 60) % 360).toDouble(),
        0.65,
        0.32,
      ).toColor();

Color resonaGlowC(int hue, {bool light = false}) => light
    ? HSLColor.fromAHSL(0.6, ((hue - 40) % 360).toDouble(), 0.55, 0.8).toColor()
    : HSLColor.fromAHSL(0.5, ((hue - 40) % 360).toDouble(), 0.6, 0.3).toColor();

/// The frosted play disc shown over covers on hover in Resona
/// (`.cover-fab`): #1f1f1f disc, white icon.
const resonaCoverFabColor = Color(0xFF1F1F1F);
