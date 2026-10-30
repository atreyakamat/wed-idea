"use client";

import { startTransition, useActionState, useMemo, useState, type FormEvent } from "react";
import { FormMessage, initialFormState, inputClass, SubmitButton } from "@/components/ui/form";
import { formatInr } from "@/lib/domain/money";
import type { Plan } from "@/lib/studio/billing";
import { MANUAL_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/studio/payments";
import { recordPayment, setPlan } from "./actions";

type PlanOption = Pick<Plan, "id" | "name" | "price_paise" | "is_trial">;

/**
 * Submits without React's automatic form reset, which would snap controlled
 * selects back to their first option while the component still shows its
 * own state (and so record something other than what's on screen).
 */
function submitWithoutReset(formAction: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
}

export function ChangePlanForm({ studioId, plans, current }: Readonly<{ studioId: string; plans: PlanOption[]; current: string }>) {
  const action = useMemo(() => setPlan.bind(null, studioId), [studioId]);
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [plan, setPlanId] = useState(current);
  // When the studio's plan changes (here or by a payment), select it.
  const [shown, setShown] = useState(current);
  if (shown !== current) {
    setShown(current);
    setPlanId(current);
  }
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Plan</span>
          <select name="plan" value={plan} onChange={(e) => setPlanId(e.target.value)} className={`${inputClass} w-40`}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton variant="secondary" disabled={pending || plan === current}>
          {pending ? "Saving…" : "Change plan"}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted">No payment is recorded. A trial studio moved to a paid plan this way is complimentary until you record a payment.</p>
      <FormMessage state={state} />
    </form>
  );
}

const MONTHS = [1, 3, 6, 12];

export function PaymentForm({ studioId, plans, initialPlan }: Readonly<{ studioId: string; plans: PlanOption[]; initialPlan: string }>) {
  const action = useMemo(() => recordPayment.bind(null, studioId), [studioId]);
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const paid = plans.filter((p) => !p.is_trial);
  const startPlan = paid.some((p) => p.id === initialPlan) ? initialPlan : (paid[0]?.id ?? "");
  const [planId, setPlanId] = useState(startPlan);
  const [months, setMonths] = useState(1);
  const expected = (paid.find((p) => p.id === planId)?.price_paise ?? 0) * months;
  const [amount, setAmount] = useState(String(expected / 100));
  const [edited, setEdited] = useState(false);
  const [reference, setReference] = useState("");

  // After a payment is recorded, clear the form so it can't be sent twice by accident.
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.success) {
      setPlanId(startPlan);
      setMonths(1);
      setEdited(false);
      setReference("");
    }
  }

  // Keep the amount at plan price × months until the admin types their own.
  const shownAmount = edited ? amount : String(expected / 100);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-3" id="payment" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Plan</span>
          <select name="plan" value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass}>
            {paid.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatInr(p.price_paise)}/mo)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Months</span>
          <select name="months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={inputClass}>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m} month{m === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Amount received (₹)</span>
          <input
            name="amount"
            inputMode="decimal"
            value={shownAmount}
            onChange={(e) => {
              setEdited(true);
              setAmount(e.target.value);
            }}
            aria-invalid={state.fieldErrors?.amount ? true : undefined}
            className={inputClass}
          />
          {state.fieldErrors?.amount ? <span className="text-xs font-normal text-danger">{state.fieldErrors.amount}</span> : null}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Paid by</span>
          <select name="method" defaultValue="upi" className={inputClass}>
            {MANUAL_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>Reference (UPI or bank ref, optional)</span>
        <input
          name="reference"
          maxLength={120}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. 431829104822"
          className={inputClass}
        />
        {state.fieldErrors?.reference ? <span className="text-xs font-normal text-danger">{state.fieldErrors.reference}</span> : null}
      </label>
      <p className="text-xs text-muted">
        Moves the studio onto this plan. Paying early for the same plan extends it from the end of the current period; a different plan
        starts today (settle any unused time by hand).
      </p>
      <FormMessage state={state} />
      <SubmitButton disabled={pending}>{pending ? "Recording…" : "Record payment"}</SubmitButton>
    </form>
  );
}
