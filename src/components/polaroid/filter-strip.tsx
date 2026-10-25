import { PHOTO_FILTERS } from "@/lib/polaroid/filters";
import { SAMPLE_PHOTO, SAMPLE_TEXT } from "@/lib/polaroid/samples";
import { getTemplate } from "@/lib/polaroid/templates";
import { PolaroidCard } from "./polaroid-card";

/** The same card in every photo filter, side by side. */
export function FilterStrip({ templateId = "elegant-floral", uid }: { templateId?: string; uid: string }) {
  const template = getTemplate(templateId);
  if (!template) return null;

  return (
    <ul className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-6">
      {PHOTO_FILTERS.map((filter) => (
        <li key={filter.id} className="flex flex-col items-center text-center">
          <PolaroidCard
            uid={`${uid}-${filter.id}`}
            template={template}
            palette={template.defaultPalette}
            text={SAMPLE_TEXT}
            photoHref={SAMPLE_PHOTO}
            filterId={filter.id}
            className="w-full max-w-[8.5rem] shadow-md"
          />
          <p className="mt-3 text-sm font-semibold">{filter.name}</p>
          <p className="text-xs text-muted">{filter.description}</p>
        </li>
      ))}
    </ul>
  );
}
