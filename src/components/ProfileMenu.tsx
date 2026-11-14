"use client";

import { useTheme } from "next-themes";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { exportLibrary } from "@/lib/backup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ListPlus, Moon, Settings, Sun, Upload } from "lucide-react";

export function ProfileMenu() {
  const { resolvedTheme, setTheme } = useTheme();
  const ui = useUi();
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  // subscribe to counts so the nudge appears as soon as data exists
  const hasData = useLibrary(
    (s) => Object.keys(s.liked).length + s.playlists.length + s.history.length > 0
  );
  const isDark = resolvedTheme !== "light";
  const needsBackup = hasData && !lastBackupAt;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-teal-300 text-[13px] font-bold text-white ring-1 ring-border transition-transform hover:scale-105 active:scale-95"
        >
          R
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-semibold">Resona listener</div>
          <div className="text-xs text-muted-foreground">Your library lives on this device</div>
        </DropdownMenuLabel>
        {needsBackup && (
          <DropdownMenuLabel className="text-xs font-normal text-amber-400">
            Your library isn&apos;t backed up yet.
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => ui.navigate({ name: "settings" })}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ui.setImportOpen(true)}>
          <ListPlus /> Import playlist
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? <Sun /> : <Moon />} {isDark ? "Light theme" : "Dark theme"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => exportLibrary()} disabled={!hasData}>
          <Download /> Export backup
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ui.navigate({ name: "settings" })}>
          <Upload /> Restore backup
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
