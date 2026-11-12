"use client";

import { useActionState } from "react";
import { Field, FormMessage, initialFormState, SubmitButton } from "@/components/ui/form";
import { requestPasswordReset } from "../actions";

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordReset, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Sending…" className="mt-2">
        Send reset link
      </SubmitButton>
    </form>
  );
}
