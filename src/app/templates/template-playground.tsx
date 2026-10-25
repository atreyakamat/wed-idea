"use client";

import { useId, useState } from "react";
import { PolaroidCard } from "@/components/polaroid/polaroid-card";
import { SAMPLE_PHOTO, SAMPLE_TEXT } from "@/lib/polaroid/samples";
import { TEMPLATES } from "@/lib/polaroid/templates";
import { resolvePalette } from "@/lib/polaroid/theme";
import type { CardText, Palette, PaletteKey } from "@/lib/polaroid/types";

const PALETTE_LABELS: Record<PaletteKey, string> = {
  paper: "Card",
  primary: "Main",
  accent: "Accent",
  ink: "Text",
};

const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/15";

/**
 * Try a template with your own names, date and colours. The base for the
 * couple's template editor in admin.
 */
export function TemplatePlayground() {
  const uid = useId().replace(/:/g, "");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [text, setText] = useState<CardText>(SAMPLE_TEXT);
  const [overrides, setOverrides] = useState<Partial<Palette>>({});

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const palette = resolvePalette(template, overrides);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    setOverrides({});
  }

  return (
    <div className="grid gap-10 rounded-3xl border border-line bg-surface p-6 sm:p-8 md:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-6">
        <fieldset>
          <legend className="text-sm font-medium">Template</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => chooseTemplate(t.id)}
                aria-pressed={t.id === templateId}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  t.id === templateId ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-3">
            Names
            <input
              className={fieldClass}
              value={text.names}
              maxLength={40}
              onChange={(e) => setText({ ...text, names: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Date
            <input
              className={fieldClass}
              value={text.date}
              maxLength={24}
              onChange={(e) => setText({ ...text, date: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
            Place <span className="font-normal text-muted">(shown on Heirloom Frame)</span>
            <input
              className={fieldClass}
              value={text.place ?? ""}
              maxLength={30}
              onChange={(e) => setText({ ...text, place: e.target.value })}
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Colours</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {(Object.keys(PALETTE_LABELS) as PaletteKey[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="color"
                  value={palette[key]}
                  onChange={(e) => setOverrides({ ...overrides, [key]: e.target.value })}
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
        </fieldset>

        <p className="text-sm text-muted">{template.description}</p>
      </div>

      <div className="flex items-end justify-center gap-6">
        <figure className="flex flex-col items-center gap-3">
          <PolaroidCard
            uid={`${uid}-large`}
            template={template}
            palette={palette}
            text={text}
            photoHref={SAMPLE_PHOTO}
            className="w-56 shadow-xl sm:w-64"
          />
          <figcaption className="text-xs text-muted">Preview</figcaption>
        </figure>
        <figure className="hidden flex-col items-center gap-3 sm:flex">
          <PolaroidCard
            uid={`${uid}-actual`}
            template={template}
            palette={palette}
            text={text}
            photoHref={SAMPLE_PHOTO}
            className="shadow-md"
            width="54mm"
            height="86mm"
          />
          <figcaption className="text-xs text-muted">Real size*</figcaption>
        </figure>
      </div>
    </div>
  );
}
