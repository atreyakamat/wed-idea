"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState, SubmitButton, type FormState } from "@/components/ui/form";
import { ACTION_LABELS, type EventStatus } from "@/lib/events/status";

type Props = {
  options: { to: EventStatus; action: (prev: FormState) => Promise<FormState>; blockedReason?: string }[];
};

export function StatusControls({ options }: Props) {
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <StatusButton key={o.to} {...o} />
        ))}
      </div>
    </div>
  );
}

function StatusButton({ to, action, blockedReason }: Props["options"][number]) {
  const [state, formAction] = useActionState(action, initialFormState);
  const primary = to === "live";
  return (
    <form action={formAction} className="flex flex-col items-start gap-2 sm:items-end">
      <SubmitButton variant={primary ? "primary" : "secondary"} pendingLabel="Updating…" disabled={Boolean(blockedReason)}>
        {ACTION_LABELS[to]}
      </SubmitButton>
      {blockedReason ? <p className="max-w-56 text-xs text-muted sm:text-right">{blockedReason}</p> : null}
      <FormMessage state={state} />
    </form>
  );
}
