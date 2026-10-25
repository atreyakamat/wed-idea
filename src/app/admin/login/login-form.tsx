"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null, email: "" };

export function LoginForm() {
  const params = useSearchParams();
  const [state, formAction, pending] = useActionState(signIn, initialState);

  const notAdmin = params.get("error") === "not-admin";
  const error =
    state.error ?? (notAdmin ? "That account doesn't have admin access." : null);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={params.get("next") ?? ""} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-base font-normal outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-base font-normal outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
