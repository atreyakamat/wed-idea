"use client";

import { useState, useTransition } from "react";
import { FormMessage, type FormState } from "@/components/ui/form";
import { SHEET_DESIGN_LABELS, SHEET_DESIGNS, type SheetDesign } from "@/lib/projects/look-sheet";
import { setLookSheets } from "./actions";

/** Pick one or both designs; clients get whichever are on. */
export function LookSheetsForm({ current }: Readonly<{ current: SheetDesign[] }>) {
  const [chosen, setChosen] = useState<SheetDesign[]>(current);
  const [state, setState] = useState<FormState>({ error: null });
  const [pending, start] = useTransition();
  const toggle = (d: SheetDesign) => setChosen((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]));
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setState(await setLookSheets(chosen)));
      }}
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">Look sheets clients get</legend>
        {SHEET_DESIGNS.map((d) => (
          <label key={d} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={chosen.includes(d)} onChange={() => toggle(d)} disabled={pending} />
            {SHEET_DESIGN_LABELS[d]}
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={pending} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
