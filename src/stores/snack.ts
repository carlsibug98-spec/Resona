"use client";

import { create } from "zustand";

/**
 * Mockup v3 snackbar: one bottom bar above the player, with an optional
 * action button ("See what's next"). Auto-dismisses after 6s.
 */
interface SnackState {
  msg: string | null;
  btn: string | null;
  action: (() => void) | null;
  show: (msg: string, btn?: string, action?: () => void) => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useSnack = create<SnackState>()((set) => ({
  msg: null,
  btn: null,
  action: null,
  show: (msg, btn, action) => {
    set({ msg, btn: btn ?? null, action: action ?? null });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => set({ msg: null, btn: null, action: null }), 6000);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ msg: null, btn: null, action: null });
  },
}));

export function snack(msg: string, btn?: string, action?: () => void) {
  useSnack.getState().show(msg, btn, action);
}
