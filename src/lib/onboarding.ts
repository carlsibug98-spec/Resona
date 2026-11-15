"use client";

import { useSettings } from "@/stores/settings";
import { snack, useSnack } from "@/stores/snack";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toast";
import type { IconName } from "@/components/Icon";

/**
 * First-run graduation. A brand-new listener sees the mockup's new-user
 * home (Welcome hero + Getting started on top, no quick tiles). The first
 * thing they *save themselves* — liking a song, creating a playlist,
 * finishing a download, importing or restoring a library — switches them
 * to the full returning-user home for good.
 *
 * Called from UI action handlers only; the starter-content seeder goes
 * through the stores directly and never graduates anyone.
 */
export function graduate(): void {
  if (useSettings.getState().onboarding === "new") {
    useSettings.getState().setOnboarding("done");
  }
}

/* ───────── mockup v3: the six-step onboarding checklist ───────── */

/** mockup GS_CARDS: the six getting-started steps, verbatim */
export const GS_STEPS = [
  { id: "search", n: "01", title: "Search anything", text: "Find songs, artists and radios by name.", hue: 30, icon: "search", cta: "Search now" },
  { id: "playlist", n: "02", title: "Make a playlist", text: "Put songs together for any mood or moment.", hue: 150, icon: "queue", cta: "Create playlist" },
  { id: "like", n: "03", title: "Like songs", text: "Tap the heart and they collect in Liked songs.", hue: 345, icon: "heart", cta: "Like a song" },
  { id: "radio", n: "04", title: "Start a radio", text: "Pick one artist and let the mix keep going.", hue: 215, icon: "radio", cta: "Start radio" },
  { id: "download", n: "05", title: "Download offline", text: "Save songs to this device for listening without signal.", hue: 280, icon: "download", cta: "Download" },
  { id: "import", n: "06", title: "Import your music", text: "Bring playlists over from another music app.", hue: 170, icon: "plus", cta: "Import library" },
] as const satisfies readonly { id: string; n: string; title: string; text: string; hue: number; icon: IconName; cta: string }[];

export type GsStepId = (typeof GS_STEPS)[number]["id"];

/** run a step's action — the mockup GS card `act` attributes (mockup GS_CTA) */
export function runGsStep(id: GsStepId): void {
  const ui = useUi.getState();
  switch (id) {
    case "search":
      ui.navigate({ name: "search" });
      break;
    case "playlist":
      ui.openModal({ kind: "createPlaylist" });
      break;
    case "like":
      toast("Tap the heart on any track to like it");
      break;
    case "radio":
      toast("Open an artist to start their radio");
      break;
    case "download":
      toast("Tap the download icon on a song to save it");
      break;
    case "import":
      ui.openModal({ kind: "import" });
      break;
  }
}

/**
 * A getting-started step is done: persist it, update the profile ring and
 * say so with the snackbar (mockup markStep). Real actions call this from
 * their handlers; the checklist popover also marks on click, like the mockup.
 */
export function markStep(id: GsStepId): void {
  const newly = useSettings.getState().markOnboardingStep(id);
  if (!newly) return;
  const done = useSettings.getState().onboardingSteps.length;
  const total = GS_STEPS.length;
  if (done < total) {
    snack(`You're doing great! ${done} of ${total} done.`, "See what's next", pulseNext);
  } else {
    snack("You finished Getting started!", "Close", () => useSnack.getState().hide());
  }
}

/** fired on window; the Getting started carousel listens and jumps to its first pending card */
export const GS_NEXT_EVENT = "resona:gs-next";
let gsNextPending = false;

/** true once if a "See what's next" request is waiting for the home view to mount */
export function consumeGsNextPending(): boolean {
  const was = gsNextPending;
  gsNextPending = false;
  return was;
}

/**
 * "See what's next" from the snackbar: go home (the carousel lives there),
 * then the carousel moves to the first step that isn't done yet and pulses it.
 */
export function pulseNext(): void {
  gsNextPending = true;
  useUi.getState().navigate({ name: "home" });
  window.dispatchEvent(new Event(GS_NEXT_EVENT));
}
