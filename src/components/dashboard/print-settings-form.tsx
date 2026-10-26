"use client";

import { useActionState } from "react";
import { Field, FormMessage, initialFormState, SubmitButton, type FormState } from "@/components/ui/form";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: { print_price: string; max_copies_per_guest: string; budget_cap: string };
  readOnly?: boolean;
};

export function PrintSettingsForm({ action, defaults, readOnly = false }: Props) {
  const [state, formAction] = useActionState(action, initialFormState);
  const v = { ...defaults, ...state.values };
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Price per print (₹)"
          name="print_price"
          inputMode="decimal"
          required
          defaultValue={v.print_price}
          error={e.print_price}
          hint="What the couple pays per copy."
        />
        <Field
          label="Max copies per guest"
          name="max_copies_per_guest"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          defaultValue={v.max_copies_per_guest}
          error={e.max_copies_per_guest}
          hint="Blank = no limit."
        />
        <Field
          label="Budget cap (₹)"
          name="budget_cap"
          inputMode="decimal"
          defaultValue={v.budget_cap}
          error={e.budget_cap}
          hint="Prints + courier. Blank = no cap."
        />
      </fieldset>
      <FormMessage state={state} />
      {readOnly ? null : (
        <div>
          <SubmitButton>Save print settings</SubmitButton>
        </div>
      )}
    </form>
  );
}
