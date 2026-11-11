"use client";

import { useActionState, useMemo } from "react";
import { FormMessage, initialFormState, inputClass, SubmitButton } from "@/components/ui/form";
import { requestPlan } from "./actions";

export function RequestPlanForm({ planId, planName, requested }: Readonly<{ planId: string; planName: string; requested: boolean }>) {
  const action = useMemo(() => requestPlan.bind(null, planId), [planId]);
  const [state, formAction] = useActionState(action, initialFormState);

  if (requested && !state.error) {
    return <p className="rounded-xl bg-success/10 px-3 py-2.5 text-center text-sm text-success">Requested. We&apos;ll be in touch.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`note-${planId}`}>
        Note for {planName} (optional)
      </label>
      <textarea
        id={`note-${planId}`}
        name="note"
        maxLength={500}
        rows={2}
        defaultValue={state.values?.note}
        placeholder="Anything we should know? (optional)"
        className={`${inputClass} text-sm`}
      />
      {state.fieldErrors?.note ? <p className="text-xs text-danger">{state.fieldErrors.note}</p> : null}
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Sending…" className="w-full">
        Choose {planName}
      </SubmitButton>
    </form>
  );
}
