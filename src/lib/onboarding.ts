"use client";

import { useSettings } from "@/stores/settings";

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
