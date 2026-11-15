"use client";

import { useEffect, useState } from "react";
import { useUi } from "@/stores/ui";

/**
 * Drag handle on the left edge of the right-hand column (queue or now
 * playing). Dragging moves the column's width, shared by both views.
 */
export function RightResizer() {
  const setWidth = useUi((s) => s.setQueueWidth);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => {
      const app = document.querySelector(".app")?.getBoundingClientRect();
      if (!app) return;
      // keep the sidebar (300px) and a usable main column (360px) on screen
      const max = Math.max(260, app.width - 16 - 300 - 360 - 16);
      setWidth(Math.max(260, Math.min(max, Math.round(app.right - 8 - e.clientX))));
    };
    const onUp = () => setResizing(false);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
    };
  }, [resizing, setWidth]);

  return (
    <div
      className={`qd-resize${resizing ? " active" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      onPointerDown={(e) => {
        e.preventDefault();
        setResizing(true);
      }}
    />
  );
}
