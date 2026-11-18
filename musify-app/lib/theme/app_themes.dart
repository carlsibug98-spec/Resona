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

import 'package:flutter/scheduler.dart';
import 'package:material_ui/material_ui.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:musify/theme/resona_ui.dart';

ThemeMode themeMode = getThemeMode(themeModeSetting);
Brightness brightness = getBrightnessFromThemeMode(themeMode);

Brightness getBrightnessFromThemeMode(ThemeMode mode) => switch (mode) {
  ThemeMode.light => Brightness.light,
  ThemeMode.dark => Brightness.dark,
  ThemeMode.system =>
    SchedulerBinding.instance.platformDispatcher.platformBrightness,
};

ThemeMode getThemeMode(int themeModeIndex) {
  const themeModes = ThemeMode.values;
  if (themeModeIndex >= 0 && themeModeIndex < themeModes.length) {
    return themeModes[themeModeIndex];
  }
  return ThemeMode.system;
}

/// Maps the accent-seeded [colorScheme] onto the Resona design system:
/// black app background, #121212 surfaces, #1F1F1F elevation, white 10%
/// hairlines, muted gray secondary text and pill-shaped controls — exactly
/// like Resona's `globals.css` mockup.
ThemeData getAppTheme(ColorScheme colorScheme) {
  final isLight = colorScheme.brightness == Brightness.light;

  final bg = isLight ? ResonaColors.bgLight : ResonaColors.bgDark;
  final surface = isLight ? ResonaColors.surfaceLight : ResonaColors.surfaceDark;
  final elev = isLight ? ResonaColors.elevLight : ResonaColors.elevDark;
  final text = isLight ? ResonaColors.textLight : ResonaColors.textDark;
  final muted = isLight ? ResonaColors.mutedLight : ResonaColors.mutedDark;
  final line = isLight ? ResonaColors.lineLight : ResonaColors.lineDark;
  final hover = isLight ? ResonaColors.hoverLight : ResonaColors.hoverDark;

  final resonaScheme = colorScheme.copyWith(
    // accent stays whatever the user picked (Resona green by default)
    primary: colorScheme.primary,
    onPrimary: ResonaColors.onBrand,
    primaryContainer: elev,
    onPrimaryContainer: text,
    secondary: colorScheme.primary,
    onSecondary: ResonaColors.onBrand,
    // Resona "selected chip": text-colored pill with bg-colored label
    secondaryContainer: text,
    onSecondaryContainer: bg,
    tertiaryContainer: elev,
    onTertiaryContainer: text,
    surface: bg,
    onSurface: text,
    onSurfaceVariant: muted,
    surfaceDim: bg,
    surfaceContainerLowest: surface,
    surfaceContainerLow: surface,
    surfaceContainer: surface,
    surfaceContainerHigh: elev,
    surfaceContainerHighest: elev,
    outline: line,
    outlineVariant: line,
    error: ResonaColors.danger,
    scrim: Colors.black,
  );

  final base = isLight ? ThemeData.light() : ThemeData.dark();

  TextStyle resonaTitle(double size, [double spacing = -0.01]) => TextStyle(
    fontSize: size,
    fontWeight: FontWeight.w800,
    letterSpacing: spacing,
    color: text,
    height: 1.15,
  );

  return ThemeData(
    scaffoldBackgroundColor: bg,
    colorScheme: resonaScheme,
    canvasColor: bg,
    cardColor: surface,
    hoverColor: hover,
    splashColor: Colors.white.withValues(alpha: 0.06),
    highlightColor: Colors.transparent,
    splashFactory: InkRipple.splashFactory,
    cardTheme: base.cardTheme.copyWith(
      elevation: 0,
      color: surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ResonaColors.radiusLg),
      ),
      margin: EdgeInsets.zero,
    ),
    appBarTheme: base.appBarTheme.copyWith(
      backgroundColor: Colors.transparent,
      foregroundColor: text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: resonaTitle(22),
      toolbarHeight: 56,
      iconTheme: IconThemeData(color: muted, size: 24),
      actionsIconTheme: IconThemeData(color: muted, size: 24),
    ),
    textTheme: base.textTheme.copyWith(
      headlineSmall: resonaTitle(24),
      headlineMedium: resonaTitle(28, -0.02),
      headlineLarge: resonaTitle(34, -0.02),
      titleLarge: resonaTitle(22),
      titleMedium: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        color: text,
        letterSpacing: -0.01,
      ),
      titleSmall: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: text,
      ),
      bodyLarge: TextStyle(fontSize: 15, color: text),
      bodyMedium: TextStyle(fontSize: 14, color: text),
      bodySmall: TextStyle(fontSize: 13, color: muted),
      labelLarge: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: text,
      ),
      labelMedium: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: muted,
      ),
      labelSmall: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: muted,
        letterSpacing: 0.04,
      ),
    ),
    listTileTheme: base.listTileTheme.copyWith(
      textColor: text,
      iconColor: muted,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ResonaColors.radius),
      ),
      selectedColor: colorScheme.primary,
    ),
    sliderTheme: base.sliderTheme.copyWith(
      year2023: false,
      trackHeight: 4,
      thumbSize: const WidgetStatePropertyAll(Size(12, 12)),
      overlayShape: const RoundSliderOverlayShape(overlayRadius: 16),
      activeTrackColor: colorScheme.primary,
      inactiveTrackColor: line,
      thumbColor: text,
      overlayColor: hover,
    ),
    progressIndicatorTheme: base.progressIndicatorTheme.copyWith(
      color: colorScheme.primary,
      linearTrackColor: line,
      borderRadius: BorderRadius.circular(4),
    ),
    switchTheme: base.switchTheme.copyWith(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return ResonaColors.onBrand;
        }
        return muted;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return colorScheme.primary;
        }
        return line;
      }),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: base.filledButtonTheme.style?.copyWith(
        backgroundColor: WidgetStateProperty.all(text),
        foregroundColor: WidgetStateProperty.all(bg),
        textStyle: const WidgetStatePropertyAll(
          TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
        shape: const WidgetStatePropertyAll(StadiumBorder()),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: base.outlinedButtonTheme.style?.copyWith(
        foregroundColor: WidgetStateProperty.all(text),
        side: WidgetStateProperty.all(BorderSide(color: line)),
        shape: const WidgetStatePropertyAll(StadiumBorder()),
        textStyle: const WidgetStatePropertyAll(
          TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: base.textButtonTheme.style?.copyWith(
        foregroundColor: WidgetStateProperty.all(colorScheme.primary),
        textStyle: const WidgetStatePropertyAll(
          TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
        shape: const WidgetStatePropertyAll(StadiumBorder()),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: base.iconButtonTheme.style?.copyWith(
        foregroundColor: WidgetStateProperty.all(muted),
        overlayColor: WidgetStateProperty.all(hover),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: elev,
      side: BorderSide.none,
      shape: const StadiumBorder(),
      labelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: muted),
      secondaryLabelStyle: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: muted,
      ),
      selectedColor: text,
      checkmarkColor: bg,
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
    ),
    searchBarTheme: base.searchBarTheme.copyWith(
      backgroundColor: WidgetStateProperty.all(elev),
      overlayColor: WidgetStateProperty.all(elev),
      elevation: const WidgetStatePropertyAll(0),
      shadowColor: const WidgetStatePropertyAll(Colors.transparent),
      shape: WidgetStateProperty.all(
        RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ResonaColors.radiusLg),
        ),
      ),
      textStyle: WidgetStateProperty.all(
        TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: text),
      ),
      hintStyle: WidgetStateProperty.all(
        TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: muted),
      ),
    ),
    inputDecorationTheme: base.inputDecorationTheme.copyWith(
      filled: true,
      fillColor: elev,
      hintStyle: TextStyle(fontSize: 14, color: muted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(ResonaColors.radiusLg),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(ResonaColors.radiusLg),
        borderSide: BorderSide(color: line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(ResonaColors.radiusLg),
        borderSide: BorderSide(color: colorScheme.primary, width: 2),
      ),
      contentPadding: const EdgeInsets.fromLTRB(18, 14, 20, 14),
    ),
    dialogTheme: base.dialogTheme.copyWith(
      backgroundColor: elev,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ResonaColors.radiusLg),
      ),
      titleTextStyle: resonaTitle(18, 0),
      contentTextStyle: TextStyle(fontSize: 14, color: muted, height: 1.45),
    ),
    popupMenuTheme: base.popupMenuTheme.copyWith(
      color: elev,
      shadowColor: Colors.black.withValues(alpha: 0.5),
      elevation: 16,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ResonaColors.radiusLg),
      ),
      textStyle: TextStyle(fontSize: 14, color: text),
    ),
    bottomSheetTheme: base.bottomSheetTheme.copyWith(
      backgroundColor: elev,
      modalBackgroundColor: elev,
      clipBehavior: Clip.antiAlias,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: text,
      closeIconColor: bg,
      contentTextStyle: TextStyle(
        color: bg,
        fontWeight: FontWeight.w600,
        fontSize: 14,
      ),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ResonaColors.radiusLg),
      ),
      elevation: 8,
      actionTextColor: bg,
      actionBackgroundColor: Colors.transparent,
    ),
    tooltipTheme: base.tooltipTheme.copyWith(
      decoration: BoxDecoration(
        color: elev,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: line),
      ),
      textStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: text),
    ),
    tabBarTheme: base.tabBarTheme.copyWith(
      labelColor: text,
      unselectedLabelColor: muted,
      indicatorColor: colorScheme.primary,
      dividerColor: line,
      labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
      unselectedLabelStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
    ),
    dividerTheme: base.dividerTheme.copyWith(color: line, thickness: 1),
    dropdownMenuTheme: base.dropdownMenuTheme.copyWith(
      menuStyle: MenuStyle(
        backgroundColor: WidgetStateProperty.all(elev),
        elevation: WidgetStateProperty.all(16),
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ResonaColors.radiusLg),
          ),
        ),
      ),
    ),
    visualDensity: VisualDensity.adaptivePlatformDensity,
    useMaterial3: true,
  );
}
