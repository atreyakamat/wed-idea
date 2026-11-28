"use client";
import { useCallback, useState } from "react";
import type { SavedLook } from "./store";

interface H { draft: SavedLook | null; past: SavedLook[]; future: SavedLook[]; key: string; t: number }
const EMPTY: H = { draft: null, past: [], future: [], key: "", t: 0 };
const LIMIT = 50;

/**
 * Draft look with undo/redo. Rapid edits with the same key (a slider drag) collapse into one history step.
 * Everything lives in one state object so an update is atomic and safe under StrictMode's double invoke.
 */
export function useDraft() {
  const [h, setH] = useState<H>(EMPTY);

  const open = useCallback((l: SavedLook | null) => setH({ ...EMPTY, draft: l }), []);
  const commit = useCallback((next: SavedLook, key = "") => {
    setH((s) => {
      if (!s.draft) return { ...s, draft: next };
      const now = Date.now();
      const merge = key && key === s.key && now - s.t < 900;
      const past = merge ? s.past : [...s.past, s.draft].slice(-LIMIT);
      return { draft: next, past, future: [], key, t: now };
    });
  }, []);
  const undo = useCallback(() => setH((s) => {
    const p = s.past[s.past.length - 1]; if (!p || !s.draft) return s;
    return { draft: p, past: s.past.slice(0, -1), future: [...s.future, s.draft], key: "", t: 0 };
  }), []);
  const redo = useCallback(() => setH((s) => {
    const f = s.future[s.future.length - 1]; if (!f || !s.draft) return s;
    return { draft: f, past: [...s.past, s.draft], future: s.future.slice(0, -1), key: "", t: 0 };
  }), []);
  return { draft: h.draft, open, commit, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
