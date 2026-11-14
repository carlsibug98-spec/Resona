"use client";

import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { HISTORY_LIMIT, parseBackupText, type ParsedBackup } from "@/lib/backup-parse";
import { applyBackup, type RestoreMode, type Section } from "@/lib/backup-merge";

/**
 * Backup = likes, playlists and history (JSON, device-independent).
 * Downloaded audio is NOT included: it lives in IndexedDB on this device,
 * so restoring never claims something is available offline when it isn't.
 */

export type { ParsedBackup } from "@/lib/backup-parse";

export function hasLibraryData(): boolean {
  const s = useLibrary.getState();
  return Object.keys(s.liked).length + s.playlists.length + s.history.length > 0;
}

export function buildBackup() {
  const s = useLibrary.getState();
  return {
    format: "resona-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    liked: s.liked,
    playlists: s.playlists,
    history: s.history,
  };
}

export function exportLibrary() {
  const json = JSON.stringify(buildBackup(), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `resona-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  // revoke later: revoking synchronously can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  useSettings.getState().setLastBackupAt(Date.now());
}

/** Reads and validates a backup file. Throws a readable Error on bad input. */
export async function parseBackup(file: File): Promise<ParsedBackup> {
  return parseBackupText(await file.text(), file.size);
}

/** Applies the chosen sections in one state update. Local audio is untouched. */
export function restoreBackup(
  parsed: ParsedBackup,
  sections: Section[],
  mode: RestoreMode
) {
  const s = useLibrary.getState();
  const next = applyBackup(
    { liked: s.liked, playlists: s.playlists, history: s.history },
    parsed,
    sections,
    mode,
    HISTORY_LIMIT
  );
  useLibrary.setState(next);
}
