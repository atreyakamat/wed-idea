"use client";
import { useCallback, useEffect, useState } from "react";

export interface Toast { msg: string; act?: { label: string; run: () => void }; k: number }
let seq = 0;

/**
 * One way to talk to the person, one message at a time. A message already waiting is not queued
 * twice; a plain message replaces other waiting plain ones; a message with an action (a way out of
 * a failure) always waits its turn. Plain messages stay 2.2 s, ones with an action 6 s.
 * `say("")` clears everything.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = toasts[0] ?? null;
  const dismiss = useCallback(() => setToasts((q) => q.slice(1)), []);
  const say = useCallback((msg: string, act?: Toast["act"]) => {
    if (!msg) { setToasts([]); return; }
    setToasts((q) => {
      if (q.some((t) => t.msg === msg)) return q;
      const keep = q.filter((t, i) => i === 0 || t.act);
      return [...keep, { msg, act, k: ++seq }].slice(-3);
    });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, toast.act ? 6000 : 2200);
    return () => clearTimeout(t);
  }, [toast, dismiss]);
  return { toast, say, dismiss };
}
