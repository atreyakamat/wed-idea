"use client";

import { useState, useTransition } from "react";
import { resetStudioStyle } from "./actions";

export function ResetStyleButton() {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          start(async () => {
            const result = await resetStudioStyle();
            setConfirming(false);
            setMessage(result.error ?? result.success ?? null);
          });
        }}
        className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink disabled:opacity-60"
      >
        {confirming ? "Tap again to forget your style" : "Reset style"}
      </button>
      {message ? <p className="text-sm text-muted" role="status">{message}</p> : null}
    </div>
  );
}
