"use client";

import { useActionState } from "react";
import { Field, FormMessage, initialFormState, inputClass, SubmitButton, type FormState } from "@/components/ui/form";
import { PROJECT_KIND_LABELS, PROJECT_KINDS } from "@/lib/projects/form";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: { name: string; kind: string; shoot_date: string };
  submitLabel: string;
  pendingLabel?: string;
};

export function ProjectForm({ action, defaults, submitLabel, pendingLabel }: Readonly<Props>) {
  const [state, formAction] = useActionState(action, initialFormState);
  const v = { ...defaults, ...state.values };
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <Field label="Project name" name="name" defaultValue={v.name} error={e.name} required maxLength={120} placeholder="Meera's 30th birthday" autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Kind of shoot
          <select name="kind" defaultValue={v.kind} className={inputClass} aria-invalid={e.kind ? true : undefined}>
            {PROJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROJECT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">Helps pick the right looks once auto-editing arrives.</span>
          {e.kind ? <span className="text-xs font-normal text-danger">{e.kind}</span> : null}
        </label>
        <Field label="Shoot date" name="shoot_date" type="date" defaultValue={v.shoot_date} error={e.shoot_date} hint="Optional" />
      </div>
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
