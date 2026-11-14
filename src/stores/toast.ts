"use client";

import { create } from "zustand";

/**
 * Mockup-style toasts: pill bubbles above the player bar, centre-bottom,
 * with a check icon for success. Auto-dismiss after 2.4s.
 */
interface ToastItem {
  id: number;
  msg: string;
  ok: boolean;
}

interface ToastState {
  items: ToastItem[];
  push: (msg: string, ok: boolean) => void;
  remove: (id: number) => void;
}

let seq = 0;

export const useToast = create<ToastState>()((set) => ({
  items: [],
  push: (msg, ok) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items.slice(-3), { id, msg, ok }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 2400);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export function toast(msg: string, ok = false) {
  useToast.getState().push(msg, ok);
}
