"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Field, FormMessage, initialFormState, SubmitButton } from "@/components/ui/form";
import { signIn } from "../actions";

const NOTICES: Record<string, string> = {
  "link-expired": "That link has expired. Sign in, or sign up again for a new one.",
};

export function LoginForm() {
  const params = useSearchParams();
  const [state, action] = useActionState(signIn, initialFormState);
  const notice = NOTICES[params.get("error") ?? ""];

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      {notice && !state.error ? <FormMessage state={{ error: notice }} /> : null}
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Signing in…" className="mt-2">
        Sign in
      </SubmitButton>
    </form>
  );
}
