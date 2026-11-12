"use client";

import { useActionState } from "react";
import { Field, FormMessage, initialFormState, SubmitButton } from "@/components/ui/form";
import { resetPassword } from "../actions";

export function ResetForm() {
  const [state, action] = useActionState(resetPassword, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="New password" name="password" type="password" autoComplete="new-password" required error={e.password} />
      <Field label="Type it again" name="confirm" type="password" autoComplete="new-password" required error={e.confirm} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…" className="mt-2">
        Save password
      </SubmitButton>
    </form>
  );
}
