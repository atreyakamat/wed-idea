/** "3 of 4 events" with a bar. Turns amber near the limit and red at it. */
export function UsageMeter({ label, used, limit, unit }: Readonly<{ label: string; used: number; limit: number; unit: string }>) {
  const share = Math.min(1, used / Math.max(1, limit));
  const full = used >= limit;
  let bar = "bg-ink";
  if (full) bar = "bg-danger";
  else if (share >= 0.75) bar = "bg-[#c98a1b]";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums font-medium">
          {used} of {limit} {unit}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={`${used} of ${limit} ${unit}`}
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(share * 100, used ? 4 : 0)}%` }} />
      </div>
      {full ? <p className="mt-1 text-xs text-danger">Limit reached</p> : null}
    </div>
  );
}
