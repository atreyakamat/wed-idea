import Link from "next/link";
import { inputClass } from "@/components/ui/form";

type Option = { value: string | null; label: string };

/** Search box plus status tabs, all in the URL so filters can be shared and bookmarked. */
export function Filters({
  path,
  query,
  status,
  options,
  placeholder,
}: Readonly<{ path: string; query: string; status: string | null; options: Option[]; placeholder: string }>) {
  const href = (value: string | null) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (value) params.set("status", value);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.value === status;
          return (
            <Link
              key={o.label}
              href={href(o.value)}
              aria-current={active ? "true" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${active ? "bg-ink text-paper" : "border border-line hover:border-ink"}`}
            >
              {o.label}
            </Link>
          );
        })}
      </nav>
      <form action={path} className="flex gap-2 sm:w-80" role="search">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <label className="sr-only" htmlFor="admin-search">
          Search
        </label>
        <input id="admin-search" name="q" type="search" defaultValue={query} placeholder={placeholder} className={inputClass} />
        <button type="submit" className="rounded-lg border border-line px-3 text-sm font-medium hover:border-ink">
          Search
        </button>
      </form>
    </div>
  );
}
