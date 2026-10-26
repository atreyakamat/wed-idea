"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/** Shape every Server Action form returns to useActionState. */
export type FormState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
  /** What the user typed, so a failed submit doesn't wipe the form. */
  values?: Record<string, string>;
  /** Shown after a successful save that stays on the page. */
  success?: string | null;
};

export const initialFormState: FormState = { error: null };

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base font-normal outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/15 aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

type FieldProps = {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name">;

export function Field({ label, name, hint, error, className, ...input }: FieldProps) {
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium ${className ?? ""}`}>
      {label}
      <input name={name} id={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClass} {...input} />
      {hint ? (
        <span id={`${name}-hint`} className="text-xs font-normal text-muted">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${name}-error`} className="text-xs font-normal text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}

type TextAreaProps = {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name">;

export function TextAreaField({ label, name, hint, error, className, ...textarea }: TextAreaProps) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium ${className ?? ""}`}>
      {label}
      <textarea name={name} id={name} aria-invalid={error ? true : undefined} className={`${inputClass} min-h-24`} {...textarea} />
      {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
      {error ? <span className="text-xs font-normal text-danger">{error}</span> : null}
    </label>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
        {state.success}
      </p>
    );
  }
  return null;
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-ink text-paper hover:opacity-90",
    secondary: "border border-line bg-surface hover:border-ink",
    danger: "border border-danger/40 text-danger hover:bg-danger/10",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className ?? ""}`}
    >
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}
