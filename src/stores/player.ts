"use client";

import { create } from "zustand";
import type { RepeatMode, Track } from "@/lib/types";
import { engine } from "@/lib/player-engine";
import { prefetchStream } from "@/lib/prefetch";
import { useDurations } from "@/stores/durations";

interface PlayerState {
  queue: Track[];
  index: number;
  contextLabel: string;
  isPlaying: boolean;
  position: number;
  duration: number;
  buffering: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;

  current: () => Track | null;
  playQueue: (tracks: Track[], startIndex?: number, label?: string) => void;
  playTrack: (track: Track, label?: string) => void;
  playFromQueue: (index: number) => void;
  enqueue: (track: Track, next?: boolean) => void;
  /** append tracks after the current queue (radio autoplay) — dedupes by videoId */
  extendQueue: (tracks: Track[]) => void;
  removeFromQueue: (index: number) => void;
  /** drag-to-reorder (mockup v3 queue drawer): move queue[from] to queue[to] */
  moveInQueue: (from: number, to: number) => void;
  toggle: () => void;
  /** advance to the next track; false when playback stopped at the end */
  next: () => boolean;
  prev: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  syncFromEngine: (s: {
    playing: boolean;
    position: number;
    duration: number;
    buffering: boolean;
  }) => void;
}

function shuffled(n: number, first: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i).filter((i) => i !== first);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return [first, ...arr];
}

let order: number[] = [];
let orderPos = 0;

/* volume survives restarts: the store is not persisted (queue/index are
   session-scoped by design), so volume + mute live in this tiny sidecar */
const VOL_KEY = "resona-volume";
function readStoredVolume(): { volume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    if (!raw) return { volume: 0.9, muted: false };
    const v = JSON.parse(raw) as { volume?: number; muted?: boolean };
    return {
      volume: typeof v.volume === "number" ? Math.min(1, Math.max(0, v.volume)) : 0.9,
      muted: !!v.muted,
    };
  } catch {
    return { volume: 0.9, muted: false };
  }
}
function writeStoredVolume(volume: number, muted: boolean) {
  try {
    localStorage.setItem(VOL_KEY, JSON.stringify({ volume, muted }));
  } catch {
    /* private mode / storage full — non-fatal */
  }
}
const storedVol = readStoredVolume();

/** resolve the next-up stream in the background so the transition is instant */
function prefetchUpcoming(queue: Track[]) {
  if (queue.length < 2) return;
  const upcoming = order[orderPos + 1];
  const t = (upcoming !== undefined ? queue[upcoming] : undefined) ?? queue[0];
  if (t) prefetchStream(t.videoId);
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  queue: [],
  index: -1,
  contextLabel: "",
  isPlaying: false,
  position: 0,
  duration: 0,
  buffering: false,
  shuffle: false,
  repeat: "off",
  volume: storedVol.volume,
  muted: storedVol.muted,

  current: () => {
    const s = get();
    return s.index >= 0 && s.index < s.queue.length ? s.queue[s.index] : null;
  },

  playQueue: (tracks, startIndex = 0, label = "") => {
    if (!tracks.length) return;
    const s = get();
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    order = s.shuffle ? shuffled(tracks.length, idx) : Array.from({ length: tracks.length }, (_, i) => i);
    // orderPos must point AT the current track inside `order`: shuffle puts
    // it at 0 (shuffled() starts with `first`), identity order puts it at
    // idx — otherwise "play album from track 3 → next" jumped to track 1.
    orderPos = s.shuffle ? 0 : idx;
    const track = tracks[idx];
    set({
      queue: tracks,
      index: idx,
      contextLabel: label,
      position: 0,
      duration: track.duration || 0,
    });
    engine.setVolume(s.muted ? 0 : s.volume);
    engine.load(track).catch(() => {});
    prefetchUpcoming(tracks);
  },

  playTrack: (track, label = "") => {
    get().playQueue([track], 0, label);
  },

  playFromQueue: (index) => {
    const s = get();
    if (index < 0 || index >= s.queue.length) return;
    order = s.shuffle ? shuffled(s.queue.length, index) : Array.from({ length: s.queue.length }, (_, i) => i);
    orderPos = s.shuffle ? 0 : index;
    set({ index, position: 0, duration: s.queue[index].duration || 0 });
    engine.load(s.queue[index]).catch(() => {});
    prefetchUpcoming(s.queue);
  },

  enqueue: (track, next = false) => {
    const s = get();
    const queue = [...s.queue];
    const at = next ? s.index + 1 : queue.length;
    queue.splice(at, 0, track);
    // keep the play order coherent with the new queue layout — without
    // this the appended track is NEVER played (order ends before it) and
    // an inserted one ends the session right after it plays
    if (s.shuffle) {
      if (next) {
        const pos = order.indexOf(s.index);
        order.splice(pos + 1, 0, at);
      } else {
        order.push(queue.length - 1);
      }
    } else {
      order = Array.from({ length: queue.length }, (_, i) => i);
      orderPos = s.index >= 0 ? s.index : 0;
    }
    set({ queue });
  },

  extendQueue: (tracks) => {
    const s = get();
    if (!tracks.length || !s.queue.length) return;
    const have = new Set(s.queue.map((t) => t.videoId));
    const add = tracks.filter((t) => !have.has(t.videoId));
    if (!add.length) return;
    const queue = [...s.queue, ...add];
    if (s.shuffle) {
      // shuffle the additions once, then append them to the play order
      for (let i = add.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [add[i], add[j]] = [add[j], add[i]];
      }
      order = [...order, ...add.map((_, i) => s.queue.length + i)];
    } else {
      order = Array.from({ length: queue.length }, (_, i) => i);
    }
    set({ queue });
  },

  removeFromQueue: (index) => {
    const s = get();
    if (index < 0 || index >= s.queue.length || index === s.index) return;
    const queue = s.queue.filter((_, i) => i !== index);
    const nextIndex = index < s.index ? s.index - 1 : s.index;
    // rebuild the play order for the new layout: stale shuffle indices
    // pointed past the queue (dead session early) or at shifted entries
    // (the wrong track replayed)
    if (s.shuffle) {
      const pos = order.indexOf(index);
      order = order
        .filter((i) => i !== index)
        .map((i) => (i > index ? i - 1 : i));
      if (pos >= 0 && pos < orderPos) orderPos = Math.max(0, orderPos - 1);
    } else {
      order = Array.from({ length: queue.length }, (_, i) => i);
      orderPos = nextIndex;
    }
    set({
      queue,
      index: nextIndex,
    });
  },

  moveInQueue: (from, to) => {
    const s = get();
    if (from === to || from < 0 || to < 0 || from >= s.queue.length || to >= s.queue.length) return;
    const queue = s.queue.slice();
    const [moved] = queue.splice(from, 1);
    queue.splice(to, 0, moved);
    let index = s.index;
    if (from === s.index) index = to;
    else if (from < s.index && to >= s.index) index--;
    else if (from > s.index && to <= s.index) index++;
    // keep the shuffle play order coherent with the new queue layout
    if (s.shuffle) {
      order = shuffled(queue.length, index);
      orderPos = 0;
    } else {
      order = Array.from({ length: queue.length }, (_, i) => i);
      orderPos = index;
    }
    set({ queue, index });
  },

  toggle: () => {
    const s = get();
    if (!s.queue.length) return;
    if (s.isPlaying) {
      engine.pause();
      set({ isPlaying: false });
    } else {
      if (s.index < 0) {
        s.playQueue(s.queue, 0, s.contextLabel);
        return;
      }
      engine.play();
      set({ isPlaying: true });
    }
  },

  next: () => {
    const s = get();
    if (!s.queue.length) return false;
    let idx: number;
    if (s.repeat === "one") {
      idx = s.index;
    } else {
      const nextPos = orderPos + 1;
      if (nextPos >= order.length) {
        if (s.repeat === "all" && order.length) {
          orderPos = 0;
          idx = order[0];
        } else {
          // end of queue — stop here; orderPos stays valid so radio
          // autoplay can extend the queue and call next() again
          engine.pause();
          set({ isPlaying: false, position: 0 });
          return false;
        }
      } else {
        orderPos = nextPos;
        idx = order[orderPos] ?? s.index + 1;
      }
    }
    const safe = Math.max(0, Math.min(idx, s.queue.length - 1));
    set({ index: safe, position: 0, duration: s.queue[safe].duration || 0 });
    engine.load(s.queue[safe]).catch(() => {});
    prefetchUpcoming(s.queue);
    return true;
  },

  prev: () => {
    const s = get();
    if (!s.queue.length) return;
    if (s.position > 3) {
      engine.seek(0);
      set({ position: 0 });
      return;
    }
    orderPos = Math.max(0, orderPos - 1);
    const idx = order[orderPos] ?? Math.max(0, s.index - 1);
    const safe = Math.max(0, Math.min(idx, s.queue.length - 1));
    set({ index: safe, position: 0, duration: s.queue[safe].duration || 0 });
    engine.load(s.queue[safe]).catch(() => {});
    prefetchUpcoming(s.queue);
  },

  seek: (sec) => {
    engine.seek(sec);
    set({ position: sec });
  },

  setVolume: (v) => {
    engine.setVolume(v);
    set({ volume: v, muted: v === 0 });
    writeStoredVolume(v, v === 0);
  },

  toggleMute: () => {
    const s = get();
    const v = s.muted ? (s.volume || 0.9) : 0;
    engine.setVolume(v);
    set({ muted: !s.muted });
    writeStoredVolume(s.volume || 0.9, !s.muted);
  },

  toggleShuffle: () => {
    const s = get();
    const shuffle = !s.shuffle;
    if (s.queue.length) {
      order = shuffle
        ? shuffled(s.queue.length, s.index)
        : Array.from({ length: s.queue.length }, (_, i) => i);
      orderPos = shuffle ? 0 : s.index;
    }
    set({ shuffle });
  },

  cycleRepeat: () => {
    const s = get();
    const next: RepeatMode =
      s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off";
    set({ repeat: next });
  },

  syncFromEngine: (st) => {
    const s = get();
    // the engine ticks at 400 ms (twice per cycle on mpv) and there are
    // 15+ store subscribers, most without selectors: a state object that
    // changes on every tick re-renders the whole app all the time. Skip
    // the set() entirely when nothing visible changed.
    const cur = s.queue[s.index];
    const needsBackfill =
      st.duration > 0 && !!cur && !(cur.duration && cur.duration > 0);
    if (
      st.position === s.position &&
      st.playing === s.isPlaying &&
      st.buffering === s.buffering &&
      (st.duration || s.duration) === s.duration &&
      !needsBackfill
    )
      return;
    const patch: Partial<PlayerState> = {
      position: st.position,
      duration: st.duration || s.duration,
      buffering: st.buffering,
    };
    if (st.playing !== s.isPlaying) patch.isPlaying = st.playing;
    // once real duration is known from audio metadata, backfill it into
    // the queue entry and the global cache so lists show exact times
    if (st.duration > 0) {
      if (cur && !(cur.duration && cur.duration > 0)) {
        const secs = Math.round(st.duration);
        const queue = s.queue.slice();
        queue[s.index] = { ...cur, duration: secs };
        patch.queue = queue;
        useDurations.getState().put(cur.videoId, secs);
      }
    }
    set(patch);
  },
}));
