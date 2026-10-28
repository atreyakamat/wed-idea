import type { StudioStatus } from "@/lib/auth";
import { STUDIO_STATUS_LABELS } from "@/lib/studio/status";

const STYLES: Record<StudioStatus, string> = {
  trialing: "bg-accent/12 text-accent",
  active: "bg-success/15 text-success",
  past_due: "bg-[#c98a1b]/15 text-[#8a5c0c] dark:text-[#e8b45a]",
  suspended: "bg-danger/12 text-danger",
};

const ICONS: Record<StudioStatus, string> = { trialing: "◷", active: "●", past_due: "!", suspended: "■" };

export function StudioStatusBadge({ status }: Readonly<{ status: StudioStatus }>) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}>
      <span aria-hidden className="text-[0.65rem] leading-none">
        {ICONS[status]}
      </span>
      {STUDIO_STATUS_LABELS[status]}
    </span>
  );
}
