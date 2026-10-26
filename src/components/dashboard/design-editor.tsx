"use client";

import { useActionState, useId, useState } from "react";
import { PolaroidCard } from "@/components/polaroid/polaroid-card";
import { FormMessage, initialFormState, inputClass, SubmitButton, type FormState } from "@/components/ui/form";
import { PHOTO_FILTERS } from "@/lib/polaroid/filters";
import { SAMPLE_PHOTO } from "@/lib/polaroid/samples";
import { TEMPLATES } from "@/lib/polaroid/templates";
import { resolvePalette, type EventTheme } from "@/lib/polaroid/theme";
import type { Palette, PaletteKey } from "@/lib/polaroid/types";

const PALETTE_LABELS: Record<PaletteKey, string> = { paper: "Card", primary: "Main", accent: "Accent", ink: "Text" };

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  unlockAction: () => Promise<void>;
  theme: EventTheme;
  canUnlock: boolean;
  readOnly?: boolean;
};

/**
 * The couple's polaroid design for one event. Changes preview live; "Save &
 * lock" fixes the design so every guest's card and print uses it.
 */
export function DesignEditor({ action, unlockAction, theme, canUnlock, readOnly = false }: Props) {
  const uid = useId().replace(/:/g, "");
  const [state, formAction] = useActionState(action, initialFormState);
  const [templateId, setTemplateId] = useState(theme.templateId);
  const [names, setNames] = useState(theme.text.names);
  const [date, setDate] = useState(theme.text.date);
  const [place, setPlace] = useState(theme.text.place ?? "");
  const [filterId, setFilterId] = useState(theme.filterId);
  const [overrides, setOverrides] = useState<Partial<Palette>>(theme.palette);

  const locked = theme.lockedAt !== null;
  const disabled = locked || readOnly;
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const palette = resolvePalette(template, overrides);
  const e = state.fieldErrors ?? {};

  const preview = (
    <PolaroidCard
      uid={`${uid}-design`}
      template={template}
      palette={palette}
      text={{ names, date, place }}
      photoHref={SAMPLE_PHOTO}
      filterId={filterId}
      className="w-56 shadow-xl sm:w-60"
    />
  );

  if (locked) {
    return (
      <div className="grid gap-8 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-sm font-medium text-success">
            <span aria-hidden>🔒</span> Design locked
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Style</dt>
            <dd>{template.name}</dd>
            <dt className="text-muted">Filter</dt>
            <dd>{PHOTO_FILTERS.find((f) => f.id === filterId)?.name}</dd>
            <dt className="text-muted">Names</dt>
            <dd>{names}</dd>
            <dt className="text-muted">Date</dt>
            <dd>{date}</dd>
            {place ? (
              <>
                <dt className="text-muted">Place</dt>
                <dd>{place}</dd>
              </>
            ) : null}
          </dl>
          <p className="text-sm text-muted">Every guest&apos;s polaroid and print uses this design.</p>
          {canUnlock && !readOnly ? (
            <form action={unlockAction}>
              <SubmitButton variant="secondary" pendingLabel="Unlocking…">
                Unlock to edit
              </SubmitButton>
            </form>
          ) : (
            <p className="text-xs text-muted">The design can only be unlocked while the event is a draft.</p>
          )}
        </div>
        <div className="flex justify-center">{preview}</div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-8 md:grid-cols-[1fr_auto]" noValidate>
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="filterId" value={filterId} />
      {(Object.keys(PALETTE_LABELS) as PaletteKey[]).map((key) => (
        <input key={key} type="hidden" name={`palette.${key}`} value={palette[key]} />
      ))}

      <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-6">
        <div>
          <p className="text-sm font-medium">Style</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTemplateId(t.id);
                  setOverrides({});
                }}
                aria-pressed={t.id === templateId}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                  t.id === templateId ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-3">
            Names on the card
            <input name="names" className={inputClass} value={names} maxLength={40} onChange={(ev) => setNames(ev.target.value)} aria-invalid={e.names ? true : undefined} />
            {e.names ? <span className="text-xs font-normal text-danger">{e.names}</span> : null}
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Date line
            <input name="date" className={inputClass} value={date} maxLength={24} onChange={(ev) => setDate(ev.target.value)} aria-invalid={e.date ? true : undefined} />
            {e.date ? <span className="text-xs font-normal text-danger">{e.date}</span> : null}
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
            Place <span className="text-xs font-normal text-muted">(on styles with a place line)</span>
            <input name="place" className={inputClass} value={place} maxLength={30} onChange={(ev) => setPlace(ev.target.value)} />
          </label>
        </div>

        <div>
          <p className="text-sm font-medium">Photo filter</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PHOTO_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterId(f.id)}
                aria-pressed={f.id === filterId}
                title={f.description}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  f.id === filterId ? "border-accent bg-accent text-paper" : "border-line hover:border-ink"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Colours</p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            {(Object.keys(PALETTE_LABELS) as PaletteKey[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="color"
                  value={palette[key]}
                  onChange={(ev) => setOverrides({ ...overrides, [key]: ev.target.value })}
                  className="h-8 w-8 cursor-pointer rounded border border-line bg-transparent"
                />
                {PALETTE_LABELS[key]}
              </label>
            ))}
            {Object.keys(overrides).length ? (
              <button type="button" onClick={() => setOverrides({})} className="text-sm text-muted underline">
                Reset colours
              </button>
            ) : null}
          </div>
        </div>

        <FormMessage state={state} />

        {readOnly ? null : (
          <div className="flex flex-wrap gap-3">
            <SubmitButton variant="secondary">Save draft</SubmitButton>
            <LockButton />
          </div>
        )}
      </fieldset>

      <div className="flex flex-col items-center gap-2">
        {preview}
        <p className="text-xs text-muted">Sample photo · 5.4 × 8.6 cm</p>
      </div>
    </form>
  );
}

function LockButton() {
  return (
    <button
      type="submit"
      name="intent"
      value="lock"
      className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition hover:opacity-90 disabled:opacity-60"
    >
      Save &amp; lock design
    </button>
  );
}
