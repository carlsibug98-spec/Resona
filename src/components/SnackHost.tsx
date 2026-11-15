"use client";

import { useSnack } from "@/stores/snack";

/** mockup .snack — single bottom bar with an optional action button */
export function SnackHost() {
  const msg = useSnack((s) => s.msg);
  const btn = useSnack((s) => s.btn);
  const action = useSnack((s) => s.action);
  if (!msg) return null;
  return (
    <div className="snack show" role="status" aria-live="polite">
      <span>{msg}</span>
      {btn && (
        <button
          onClick={() => {
            action?.();
            useSnack.getState().hide();
          }}
        >
          {btn}
        </button>
      )}
    </div>
  );
}
