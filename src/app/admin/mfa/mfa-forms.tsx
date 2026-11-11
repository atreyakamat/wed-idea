"use client";

import Image from "next/image";
import { useActionState, useMemo } from "react";
import { Field, FormMessage, initialFormState, SubmitButton } from "@/components/ui/form";
import { beginEnrolment, verifyCode, type EnrolState } from "./actions";

export function VerifyForm({ factorId, next }: Readonly<{ factorId: string; next: string }>) {
  const action = useMemo(() => verifyCode.bind(null, factorId, next), [factorId, next]);
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field
        label="6-digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123 456"
        maxLength={9}
        required
        autoFocus
        error={state.fieldErrors?.code}
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Checking…" className="w-full py-3">
        Continue
      </SubmitButton>
    </form>
  );
}

const initialEnrolState: EnrolState = { error: null };

export function EnrolForm({ next }: Readonly<{ next: string }>) {
  const [state, formAction] = useActionState(beginEnrolment, initialEnrolState);

  if (!state.factorId || !state.qrCode) {
    return (
      <form action={formAction} className="flex flex-col gap-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>Install an authenticator app, like Google Authenticator, 1Password or Authy.</li>
          <li>Scan the QR code on the next step.</li>
          <li>Enter the 6-digit code it shows.</li>
        </ol>
        <FormMessage state={{ error: state.error }} />
        <SubmitButton pendingLabel="Starting…" className="w-full py-3">
          Set up authenticator
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center rounded-xl bg-white p-3">
        <Image src={state.qrCode} alt="QR code for your authenticator app" width={180} height={180} unoptimized />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Can&apos;t scan? Enter the key instead</summary>
        <code className="mt-2 block break-all rounded-lg bg-line/50 px-3 py-2 font-mono text-xs" data-testid="totp-secret">
          {state.secret}
        </code>
      </details>
      <VerifyForm factorId={state.factorId} next={next} />
    </div>
  );
}
