"use client";

import { hueFromId } from "@/lib/format";
import { seedHue } from "@/lib/seed";
import type { Track } from "@/lib/types";

/** per-track hue: starter seeds keep their mockup hue, everything else hashes the id */
export function hueFor(track: Track): number {
  return seedHue(track.videoId) ?? hueFromId(track.videoId);
}

export function grad(hue: number): string {
  return `linear-gradient(135deg,hsl(${hue} 70% 48%),hsl(${(hue + 50) % 360} 60% 14%))`;
}

export function plGrad(hue: number): string {
  return `linear-gradient(135deg,hsl(${hue} 70% 46%),hsl(${(hue + 90) % 360} 55% 16%))`;
}

export function initials(s: string): string {
  return s
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * Cover art used everywhere (player bar, rows, panels).
 * Real thumbnails when the track has one; the mockup's letter-on-gradient
 * tiles are the fallback while a starter seed is still resolving.
 */
export function MiniArt({
  track,
  className,
  style,
}: {
  track: Track | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (track?.thumb) {
    return (
      <img
        src={track.thumb}
        alt=""
        loading="lazy"
        className={className}
        style={{ objectFit: "cover", ...style }}
      />
    );
  }
  const hue = track ? hueFor(track) : 0;
  return (
    <div className={className} style={{ background: grad(hue), ...style }}>
      <span>{track ? initials(track.title) : ""}</span>
    </div>
  );
}

/** big square cover (cards, playlist hero, now-playing panels) */
export function CoverArt({
  track,
  className,
  letter,
  hue,
  style,
}: {
  track?: Track | null;
  className?: string;
  letter?: string;
  hue?: number;
  style?: React.CSSProperties;
}) {
  if (track?.thumb) {
    return (
      <img
        src={track.thumb}
        alt=""
        loading="lazy"
        className={className}
        style={{ objectFit: "cover", ...style }}
      />
    );
  }
  const h = hue ?? (track ? hueFor(track) : 280);
  return (
    <div className={className} style={{ background: grad(h), ...style }}>
      <span>{letter ?? (track ? initials(track.title) : "♪")}</span>
    </div>
  );
}
