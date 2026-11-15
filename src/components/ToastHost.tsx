"use client";

import { useToast } from "@/stores/toast";
import { Icon } from "@/components/Icon";

/** mockup toast pills — centre-bottom above the player bar */
export function ToastHost() {
  const items = useToast((s) => s.items);
  if (!items.length) return null;
  return (
    <div className="toasts">
      {items.map((t) => (
        <div className="toast" key={t.id}>
          {t.ok && <Icon name="check" className="xs" />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}
