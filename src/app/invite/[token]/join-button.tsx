"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "./actions";

export function JoinButton({ token }: Readonly<{ token: string }>) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await acceptInvite(token);
            setError(result.error);
          })
        }
        className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Joining…" : "Join the studio"}
      </button>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
