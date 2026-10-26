import { STATUS_LABELS, type EventStatus } from "@/lib/events/status";

const STYLES: Record<EventStatus, string> = {
  draft: "bg-line text-muted",
  live: "bg-success/15 text-success",
  closed: "bg-ink/10 text-ink",
  archived: "bg-line text-muted",
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}>
      {status === "live" ? <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> : null}
      {STATUS_LABELS[status]}
    </span>
  );
}
