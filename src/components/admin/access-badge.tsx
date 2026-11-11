import type { StudioAccess } from "@/lib/studio/status";

const BADGES: Partial<Record<StudioAccess, { label: string; className: string; icon: string }>> = {
  payment_due: { label: "Payment due", className: "bg-[#c98a1b]/15 text-[#8a5c0c] dark:text-[#e8b45a]", icon: "!" },
  payment_overdue: { label: "Overdue", className: "bg-danger/12 text-danger", icon: "!!" },
  trial_ended: { label: "Trial ended", className: "bg-[#c98a1b]/15 text-[#8a5c0c] dark:text-[#e8b45a]", icon: "◷" },
};

/** Shown next to the status badge when a studio's plan needs attention. Nothing when all is well. */
export function AccessBadge({ access }: Readonly<{ access: StudioAccess }>) {
  const badge = BADGES[access];
  if (!badge) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
      <span aria-hidden className="text-[0.65rem] leading-none">
        {badge.icon}
      </span>
      {badge.label}
    </span>
  );
}
