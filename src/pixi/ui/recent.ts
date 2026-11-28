/** Counts how often each look is used so the ones a person actually reaches for come first. */
const KEY = "pixi:use:v1";
const MAX = 40;

type Counts = Record<string, { n: number; t: number }>;

function read(): Counts {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Counts; } catch { return {}; }
}

export function noteUse(id: string) {
  try {
    const c = read();
    c[id] = { n: (c[id]?.n ?? 0) + 1, t: Date.now() };
    const keys = Object.keys(c);
    if (keys.length > MAX) {
      keys.sort((a, b) => (c[a].n - c[b].n) || (c[a].t - c[b].t));
      for (const k of keys.slice(0, keys.length - MAX)) delete c[k];
    }
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch { /* private mode */ }
}

/** Most used first, ties broken by most recent. Only ids still present in `known`. */
export function topUsed(known: Set<string>, limit = 12): string[] {
  const c = read();
  return Object.keys(c)
    .filter((k) => known.has(k))
    .sort((a, b) => (c[b].n - c[a].n) || (c[b].t - c[a].t))
    .slice(0, limit);
}
