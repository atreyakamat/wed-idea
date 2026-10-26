"use client";

import { useActionState } from "react";
import { Field, FormMessage, initialFormState, SubmitButton } from "@/components/ui/form";
import { signUp } from "../actions";

export function SignupForm() {
  const [state, action] = useActionState(signUp, initialFormState);

  if (state.success) {
    return <FormMessage state={state} />;
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Creating account…" className="mt-2">
        Create account
      </SubmitButton>
    </form>
  );
}
