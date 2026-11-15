"use client";

import { useEffect, useState } from "react";

type Tip = { text: string; x: number; y: number; pos: "right" | "bottom" };

/**
 * One tooltip for the whole app, driven by data-tip="…" attributes (and an
 * optional data-tip-pos="bottom"). It lives on <body>-level fixed positioning,
 * so scrolling lists and the header can't clip it.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let el: HTMLElement | null = null;
    let timer: number | undefined;
    const hide = () => {
      window.clearTimeout(timer);
      el = null;
      setTip(null);
    };
    const onOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      if (target === el) return;
      hide();
      if (!target) return;
      el = target;
      timer = window.setTimeout(() => {
        const r = target.getBoundingClientRect();
        const pos = target.dataset.tipPos === "bottom" ? "bottom" : "right";
        setTip({
          text: target.dataset.tip ?? "",
          x: pos === "right" ? r.right + 10 : r.left + r.width / 2,
          y: pos === "right" ? r.top + r.height / 2 : r.bottom + 8,
          pos,
        });
      }, 350);
    };
    const onOut = (e: MouseEvent) => {
      if (el && !el.contains(e.relatedTarget as Node | null)) hide();
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("scroll", hide, { capture: true });
      window.clearTimeout(timer);
    };
  }, []);

  if (!tip) return null;
  return (
    <div className={`tip tip-${tip.pos}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.text}
    </div>
  );
}
