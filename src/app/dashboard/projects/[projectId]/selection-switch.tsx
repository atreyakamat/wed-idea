"use client";

import { useState, useTransition } from "react";
import { FormMessage, type FormState } from "@/components/ui/form";
import { setSelectionOnly } from "../actions";

/** Lets guests download only the photos they hearted. Unpicked photos stay with the studio. */
export function SelectionSwitch({ projectId, selectionOnly, canManage }: Readonly<{ projectId: string; selectionOnly: boolean; canManage: boolean }>) {
  const [on, setOn] = useState(selectionOnly);
  const [state, setState] = useState<FormState>({ error: null });
  const [pending, start] = useTransition();
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={on}
          disabled={!canManage || pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            start(async () => setState(await setSelectionOnly(projectId, next)));
          }}
        />
        <span>
          <span className="block font-semibold">Guests download only the photos they pick</span>
          <span className="block text-sm text-muted">
            Guests heart the photos they want. Their downloads then include only those. Nothing is removed: the rest stay with you.
          </span>
        </span>
      </label>
      <FormMessage state={state} />
    </section>
  );
}
