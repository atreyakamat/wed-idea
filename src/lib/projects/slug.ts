import { slugify } from "@/lib/domain/slug";

/**
 * A project's short name, used by the PC app to match a folder to a project
 * ("Meera 30th" -> "meera-30th"). Adds "-2", "-3"… when a name is taken, and
 * falls back to "project" for names with no letters or digits.
 */
export function uniqueProjectSlug(name: string, taken: ReadonlySet<string>): string {
  let base = slugify(name).slice(0, 52).replace(/-+$/g, "");
  if (base.length < 3) base = base ? `project-${base}` : "project";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
