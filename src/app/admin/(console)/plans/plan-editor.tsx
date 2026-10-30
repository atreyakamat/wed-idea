"use client";

import { useActionState, useMemo } from "react";
import { Field, FormMessage, initialFormState, SubmitButton } from "@/components/ui/form";
import type { Plan } from "@/lib/studio/billing";
import { updatePlan } from "./actions";

export function PlanEditor({ plan, studios }: Readonly<{ plan: Plan; studios: number }>) {
  const action = useMemo(() => updatePlan.bind(null, plan.id, plan.is_trial), [plan.id, plan.is_trial]);
  const [state, formAction] = useActionState(action, initialFormState);
  const v = (key: string, fallback: string | number) => state.values?.[key] ?? String(fallback);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5" noValidate>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{plan.name}</h2>
        <span className="text-xs text-muted">
          {studios} studio{studios === 1 ? "" : "s"}
        </span>
      </div>
      <Field label="Name" name="name" defaultValue={v("name", plan.name)} maxLength={40} error={state.fieldErrors?.name} />
      {plan.is_trial ? (
        <p className="text-sm text-muted">Free, for 14 days from sign-up.</p>
      ) : (
        <Field
          label="Price a month (₹)"
          name="price"
          inputMode="decimal"
          defaultValue={v("price", plan.price_paise / 100)}
          error={state.fieldErrors?.price}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Events a month" name="events_per_month" inputMode="numeric" defaultValue={v("events_per_month", plan.events_per_month)} error={state.fieldErrors?.events_per_month} />
        <Field label="Photos per event" name="photos_per_event" inputMode="numeric" defaultValue={v("photos_per_event", plan.photos_per_event)} error={state.fieldErrors?.photos_per_event} />
        <Field label="Team seats" name="team_seats" inputMode="numeric" defaultValue={v("team_seats", plan.team_seats)} error={state.fieldErrors?.team_seats} />
        <Field label="Gallery days" name="gallery_days" inputMode="numeric" defaultValue={v("gallery_days", plan.gallery_days)} error={state.fieldErrors?.gallery_days} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="remove_branding" defaultChecked={plan.remove_branding} className="h-4 w-4 accent-[var(--ink)]" />
        Remove the Cute Wedding Polaroid credit from guest galleries
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save {plan.name}</SubmitButton>
    </form>
  );
}
