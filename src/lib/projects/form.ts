import { z } from "zod";
import { formText } from "@/lib/form-data";

export const PROJECT_KINDS = ["wedding", "birthday", "concert", "outdoor", "portrait", "corporate", "other"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  concert: "Concert",
  outdoor: "Outdoor shoot",
  portrait: "Portraits",
  corporate: "Corporate",
  other: "Other",
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const projectSchema = z.object({
  name: z.string().min(1, "Give the project a name").max(120, "Keep the name under 120 characters"),
  kind: z.enum(PROJECT_KINDS, { error: "Pick what kind of shoot this is" }),
  shoot_date: z
    .string()
    .refine((v) => v === "" || (DATE.test(v) && !Number.isNaN(Date.parse(v))), "Pick a valid date")
    .transform((v) => (v === "" ? null : v)),
});

export type ProjectInput = z.output<typeof projectSchema>;

export type ParsedProject =
  | { ok: true; data: ProjectInput }
  | { ok: false; fieldErrors: Record<string, string>; values: Record<string, string> };

export function parseProjectForm(formData: FormData): ParsedProject {
  const values = { name: formText(formData, "name"), kind: formText(formData, "kind") || "other", shoot_date: formText(formData, "shoot_date") };
  const parsed = projectSchema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  return { ok: false, fieldErrors, values };
}
