"use client";

import { useRef, useState } from "react";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { Icon } from "@/components/Icon";
import { MiniArt } from "@/lib/art";
import { prefetchStream } from "@/lib/prefetch";
import { toast } from "@/stores/toast";

interface DragState {
  el: HTMLElement;
  /** absolute queue index of the grabbed row */
  from: number;
  to: number;
  startY: number;
  pid: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Mockup v3 queue drawer — the right-side panel with Now playing + the
 * next-up list. Tap a row to play it; press and hold (350ms), then drag
 * up or down to reorder — a drop line shows where the song will land.
 */
export function QueueDrawer() {
  const open = useUi((s) => s.queueDrawer);
  const setQueueDrawer = useUi((s) => s.setQueueDrawer);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playFromQueue = usePlayer((s) => s.playFromQueue);
  const moveInQueue = usePlayer((s) => s.moveInQueue);

  const now = index >= 0 && index < queue.length ? queue[index] : undefined;
  const upcoming = queue.map((t, i) => ({ t, i })).slice(index + 1);

  const dragRef = useRef<DragState | null>(null);
  const justDragged = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [liftId, setLiftId] = useState<number | null>(null);
  const [dy, setDy] = useState(0);
  const [dropTop, setDropTop] = useState<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".qd-row");
    if (!row || e.button !== 0) return;
    // resolve while the finger is down — the tap that follows plays instantly
    prefetchStream(queue[Number(row.dataset.idx)]?.videoId);
    const from = Number(row.dataset.idx);
    const d: DragState = {
      el: row,
      from,
      to: from,
      startY: e.clientY,
      pid: e.pointerId,
      active: false,
      timer: null,
    };
    dragRef.current = d;
    row.setPointerCapture(e.pointerId);
    d.timer = setTimeout(() => {
      if (dragRef.current !== d) return;
      d.active = true;
      setLiftId(from);
      if (navigator.vibrate) navigator.vibrate(12);
    }, 350);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pid) return;
    const delta = e.clientY - d.startY;
    if (!d.active) {
      // moved before the hold timer fired — it's a tap or a scroll, not a drag
      if (Math.abs(delta) > 8) {
        if (d.timer) clearTimeout(d.timer);
        dragRef.current = null;
      }
      return;
    }
    setDy(delta);
    const list = listRef.current;
    if (!list) return;
    const others = Array.from(list.querySelectorAll<HTMLElement>(".qd-row")).filter((r) => r !== d.el);
    const centre = d.el.offsetTop + d.el.offsetHeight / 2 + delta;
    const k = others.filter((r) => r.offsetTop + r.offsetHeight / 2 < centre).length;
    // X = the queue index the song will sit in front of (queue.length = "at the end")
    const X = k < others.length ? Number(others[k].dataset.idx) : queue.length;
    d.to = X - (d.from < X ? 1 : 0);
    let y: number;
    if (k < others.length) {
      y = others[k].offsetTop - 2;
    } else {
      const last = others[others.length - 1];
      y = last ? last.offsetTop + last.offsetHeight + 2 : 0;
    }
    setDropTop(y);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pid) return;
    if (d.timer) clearTimeout(d.timer);
    dragRef.current = null;
    setDropTop(null);
    if (!d.active) return; // a tap — the click handler plays it
    setLiftId(null);
    setDy(0);
    if (d.to !== d.from) moveInQueue(d.from, d.to);
    // suppress the click that follows the pointerup so a drop never plays
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  };

  return (
    <aside
      className={`qd${open ? " open" : ""}`}
      aria-label="Queue"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="qd-h">
        <div className="qd-tabs">
          <button className="on">Queue</button>
          <button onClick={() => toast("Recently played is in the history tab of your library")}>
            Recently played
          </button>
        </div>
        <button className="iconbtn" onClick={() => setQueueDrawer(false)} aria-label="Close queue">
          <Icon name="x" />
        </button>
      </div>
      <div className="qd-sec">
        <h4>Now playing</h4>
        {now ? (
          <div className="qd-now">
            <MiniArt track={now} className="mini" />
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="trunc">{now.title}</b>
              <span className="trunc">{now.artist}</span>
            </div>
          </div>
        ) : (
          <span className="muted">Nothing playing</span>
        )}
      </div>
      <div className="qd-sec" style={{ flex: 1 }}>
        <h4>Next in queue</h4>
        <div className={`qd-list${liftId !== null ? " dragging" : ""}`} ref={listRef}>
          {upcoming.length === 0 && (
            <div className="muted" style={{ padding: 8 }}>
              Queue is empty. Add songs with the ⋯ menu.
            </div>
          )}
          {upcoming.map(({ t, i }) => (
            <div
              key={i}
              data-idx={i}
              className={`qd-row${liftId === i ? " lift" : ""}`}
              style={liftId === i ? { transform: `translateY(${dy}px)` } : undefined}
              onClick={() => {
                if (justDragged.current) return;
                playFromQueue(i);
              }}
            >
              <MiniArt track={t} className="mini" />
              <div className="grow">
                <b className="trunc">{t.title}</b>
                <span className="sub2 trunc">{t.artist}</span>
              </div>
              <span className="grip" aria-hidden="true">
                ⋮⋮
              </span>
            </div>
          ))}
          {dropTop !== null && <div className="qd-drop" style={{ top: dropTop, display: "block" }} />}
        </div>
        <p className="qd-hint">Press and hold a song, then drag it up or down.</p>
      </div>
    </aside>
  );
}
