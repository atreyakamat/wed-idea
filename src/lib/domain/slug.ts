// Event slugs appear in links: /e/priya-rahul. Must match the check
// constraint on events.slug.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN = 3;
const MAX = 60;

export function isValidSlug(slug: string): boolean {
  return slug.length >= MIN && slug.length <= MAX && SLUG_PATTERN.test(slug);
}

/** "Priya & Rahül" -> "priya-rahul". May return "" for input with no letters. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX)
    .replace(/-+$/g, "");
}
