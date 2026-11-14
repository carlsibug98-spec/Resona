import { cn } from "@/lib/utils";

/** Animated 3-bar "now playing" indicator. Pure CSS, pauses when not playing. */
export function EqBars({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("eq", !playing && "eq-paused", className)}>
      <i />
      <i />
      <i />
    </span>
  );
}
