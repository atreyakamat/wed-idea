import { z } from "zod";
import { getTemplate, TEMPLATES } from "./templates";
import type { Palette, PolaroidTemplate } from "./types";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #a8834a");

/**
 * The couple's card settings, stored in events.theme (jsonb). Validated on
 * every save; once locked, guests' cards and prints use exactly this.
 */
export const eventThemeSchema = z.object({
  templateId: z.enum(TEMPLATES.map((t) => t.id) as [string, ...string[]]),
  palette: z
    .object({ paper: hex, primary: hex, accent: hex, ink: hex })
    .partial()
    .default({}),
  text: z.object({
    names: z.string().trim().min(1, "Add the couple's names").max(40),
    date: z.string().trim().min(1, "Add the date").max(24),
    place: z.string().trim().max(30).optional(),
  }),
  lockedAt: z.iso.datetime().nullable().default(null),
});

export type EventTheme = z.infer<typeof eventThemeSchema>;

/** Template defaults with the couple's colour choices applied on top. */
export function resolvePalette(template: PolaroidTemplate, overrides: Partial<Palette> = {}): Palette {
  return { ...template.defaultPalette, ...overrides };
}

export function resolveTheme(theme: EventTheme) {
  const template = getTemplate(theme.templateId);
  if (!template) throw new Error(`Unknown template: ${theme.templateId}`);
  return { template, palette: resolvePalette(template, theme.palette), text: theme.text };
}
