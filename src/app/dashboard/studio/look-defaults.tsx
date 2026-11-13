"use client";

import { useState, useTransition } from "react";
import { getLook, looksFor, type Group } from "@/lib/looks/data";
import { LIGHTING_LABELS } from "@/lib/projects/paths";
import { setLookDefault } from "./actions";

type Props = { groups: Group[]; current: Partial<Record<Group, string>>; learnt: Record<string, string>; standard: Record<string, string> };

/** One dropdown per kind of light. "Automatic" lets the learnt look (or the standard one) decide. */
export function LookDefaults({ groups, current, learnt, standard }: Props) {
  return (
    <div className="mt-5 divide-y divide-line">
      {groups.map((g) => (
        <LightRow key={g} group={g} chosen={current[g] ?? null} fallback={learnt[g] ?? standard[g]} />
      ))}
    </div>
  );
}

function LightRow({ group, chosen, fallback }: { group: Group; chosen: string | null; fallback: string }) {
  const [value, setValue] = useState(chosen ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (next: string) => {
    setValue(next);
    start(async () => {
      const result = await setLookDefault(group, next || null);
      setMessage(result.error ?? result.success ?? null);
    });
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <label htmlFor={`look-${group}`} className="text-sm text-muted">
        {LIGHTING_LABELS[group]}
      </label>
      <div className="flex items-center gap-3">
        <select
          id={`look-${group}`}
          value={value}
          disabled={pending}
          onChange={(e) => save(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          <option value="">Automatic ({getLook(fallback).name})</option>
          {looksFor(group).map((look) => (
            <option key={look.id} value={look.id}>
              {look.name}
            </option>
          ))}
        </select>
        {message ? (
          <span className="text-xs text-muted" role="status">
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
