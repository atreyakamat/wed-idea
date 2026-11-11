"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, SubmitButton } from "@/components/ui/form";
import { connectComputer, disconnectComputer, type ConnectState } from "./actions";

export function ConnectForm({ siteUrl }: Readonly<{ siteUrl: string }>) {
  const [state, formAction] = useActionState(connectComputer, { error: null } as ConnectState);
  const [copied, setCopied] = useState(false);

  if (state.token) {
    const command = `cwp-worker login --site ${siteUrl} --token ${state.token}`;
    return (
      <div className="flex flex-col gap-3">
        <p className="font-semibold">“{state.name}” is connected. Copy this now: it won&apos;t be shown again.</p>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
          <code className="min-w-0 flex-1 break-all text-xs">{command}</code>
          <button
            type="button"
            className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold hover:bg-line/60"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(command);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-sm text-muted">Run it once on that computer. Treat it like a password: anyone with it can upload to your studio.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <Field label="Computer name" name="name" placeholder="Studio iMac" maxLength={60} required className="sm:w-72" error={state.error ?? undefined} autoComplete="off" />
      <SubmitButton pendingLabel="Connecting…">Connect a computer</SubmitButton>
    </form>
  );
}

export function DisconnectButton({ tokenId, name }: Readonly<{ tokenId: string; name: string }>) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirm) {
    return (
      <button type="button" onClick={() => setConfirm(true)} className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold hover:border-ink">
        Disconnect
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      Disconnect {name}?
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError((await disconnectComputer(tokenId)).error);
          })
        }
        className="rounded-full border border-danger/40 px-4 py-1.5 font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
      >
        Yes
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="font-medium text-muted hover:text-ink">
        Cancel
      </button>
      {error ? <span className="text-danger">{error}</span> : null}
    </span>
  );
}
