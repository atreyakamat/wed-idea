// A random id for this browser, so a guest's ❤ favourites follow them around
// the gallery without an account. Kept in localStorage when allowed.

const KEY = "cwp-visitor";
let memory: string | null = null;

export function visitorId(): string {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved && /^[0-9a-f-]{36}$/.test(saved)) return saved;
    const id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    memory ??= crypto.randomUUID();
    return memory;
  }
}
