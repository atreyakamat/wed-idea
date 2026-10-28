"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { FormMessage, initialFormState, inputClass, SubmitButton } from "@/components/ui/form";
import type { StudioStatus } from "@/lib/auth";
import { STUDIO_STATUS_LABELS } from "@/lib/studio/status";
import { extendTrial, setStudioStatus } from "./actions";

const STATUSES: StudioStatus[] = ["trialing", "active", "past_due", "suspended"];

const statusButtonLabel = (status: StudioStatus) => (status === "suspended" ? "Suspend studio" : "Save status");

export function StatusForm({ studioId, current }: Readonly<{ studioId: string; current: StudioStatus }>) {
  const action = useMemo(() => setStudioStatus.bind(null, studioId), [studioId]);
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [status, setStatus] = useState<StudioStatus>(current);
  // After a save the page refreshes with a new current status: select it.
  const [shown, setShown] = useState(current);
  if (shown !== current) {
    setShown(current);
    setStatus(current);
  }

  return (
    <form
      // Submitted by hand rather than through the action prop: React resets a
      // form after an action, which would snap the radios back to the old status
      // while this component still shows the new one.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <fieldset>
        <legend className="text-sm font-medium">Status</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition has-[:checked]:border-ink has-[:checked]:bg-line/40 ${
                s === "suspended" ? "border-danger/30" : "border-line"
              }`}
            >
              <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="accent-[var(--ink)]" />
              {STUDIO_STATUS_LABELS[s]}
              {s === current ? <span className="ml-auto text-xs text-muted">now</span> : null}
            </label>
          ))}
        </div>
        {state.fieldErrors?.status ? <p className="mt-1 text-xs text-danger">{state.fieldErrors.status}</p> : null}
      </fieldset>

      {status === "suspended" && current !== "suspended" ? (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Reason (the studio sees this)</span>
          <textarea
            name="reason"
            maxLength={500}
            required
            defaultValue={state.values?.reason}
            aria-invalid={state.fieldErrors?.reason ? true : undefined}
            placeholder="Payment failed twice. Reply to our email to sort it out"
            className={`${inputClass} min-h-20`}
          />
          {state.fieldErrors?.reason ? <span className="text-xs font-normal text-danger">{state.fieldErrors.reason}</span> : null}
          <span className="text-xs font-normal text-muted">They can&apos;t create events, go live or capture. Guests keep their galleries.</span>
        </label>
      ) : null}

      <FormMessage state={state} />
      <SubmitButton variant={status === "suspended" ? "danger" : "primary"} disabled={pending || status === current}>
        {pending ? "Saving…" : statusButtonLabel(status)}
      </SubmitButton>
    </form>
  );
}

export function TrialForm({ studioId }: Readonly<{ studioId: string }>) {
  const action = useMemo(() => extendTrial.bind(null, studioId), [studioId]);
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Extend by</span>
          <select name="days" defaultValue="14" className={`${inputClass} w-36`}>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <SubmitButton variant="secondary" pendingLabel="Extending…">
          Extend trial
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
