const weekFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * New studios per week, oldest to newest. One series, so no legend: the
 * heading names it. Bars show their count on hover or focus, and a table
 * carries the same numbers for screen readers.
 */
export function SignupsChart({ weeks }: Readonly<{ weeks: { week: string; studios: number }[] }>) {
  const max = Math.max(1, ...weeks.map((w) => w.studios));
  const label = (w: { week: string }) => `Week of ${weekFormat.format(new Date(w.week))}`;

  return (
    <figure className="rounded-2xl border border-line bg-surface p-5">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">New studios per week</span>
        <span className="text-xs text-muted">Last 12 weeks</span>
      </figcaption>

      <div className="mt-6 flex h-36 items-end gap-0.5 border-b border-line" aria-hidden>
        {weeks.map((w) => (
          <div key={w.week} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-7 rounded-t bg-chart transition-opacity group-hover:opacity-80"
              style={{ height: w.studios ? `${(w.studios / max) * 100}%` : "2px", opacity: w.studios ? undefined : 0.35 }}
            />
            <span className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-paper group-hover:block">
              {label(w)}: {w.studios}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted" aria-hidden>
        <span>{weeks[0] ? weekFormat.format(new Date(weeks[0].week)) : ""}</span>
        <span>This week</span>
      </div>

      <table className="sr-only">
        <caption>New studios per week</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">New studios</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <th scope="row">{label(w)}</th>
              <td>{w.studios}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
