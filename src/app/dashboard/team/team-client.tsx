"use client";

import { useState, useTransition } from "react";
import type { MemberRole } from "@/lib/auth";
import { INVITE_ROLES, ROLE_HINTS, ROLE_LABELS, type InviteRole } from "@/lib/team";
import { cancelInvite, changeRole, createInvite, removeMember } from "./actions";

export function InviteForm({ canInviteAdmins, seatsLeft }: Readonly<{ canInviteAdmins: boolean; seatsLeft: number | null }>) {
  const [role, setRole] = useState<InviteRole>("operator");
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<{ url: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const roles = INVITE_ROLES.filter((r) => r !== "admin" || canInviteAdmins);

  if (result) {
    return (
      <div className="rounded-xl border border-line bg-paper p-4" role="status">
        <p className="text-sm font-semibold">Invite ready{label.trim() ? ` for ${label.trim()}` : ""}</p>
        <p className="mt-1 text-xs text-muted">Send it now: for safety, the link isn&apos;t shown again.</p>
        <code className="mt-3 block break-all rounded-lg bg-line/50 px-3 py-2 text-xs">{result.url}</code>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(result.message)}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper hover:opacity-90">
            Send on WhatsApp
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(result.url).then(() => setCopied(true));
            }}
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setLabel("");
              setCopied(false);
            }}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted hover:text-ink"
          >
            Invite someone else
          </button>
        </div>
      </div>
    );
  }

  const full = seatsLeft !== null && seatsLeft <= 0;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createInvite(role, label);
          if (r.error || !r.url || !r.message) setError(r.error ?? "Couldn't make the invite.");
          else setResult({ url: r.url, message: r.message });
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          Who is it for? <span className="font-normal text-muted">(optional, just for you)</span>
        </span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Rahul, second shooter" className="rounded-xl border border-line bg-paper px-3 py-2.5 text-base" />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Role</legend>
        {roles.map((r) => (
          <label key={r} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${role === r ? "border-ink" : "border-line"}`}>
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1" />
            <span>
              <span className="block text-sm font-semibold">{ROLE_LABELS[r]}</span>
              <span className="block text-xs text-muted">{ROLE_HINTS[r]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {full ? <p className="text-sm text-muted">Every seat on your plan is taken. Remove someone or upgrade to invite more.</p> : null}
      <button type="submit" disabled={pending || full} className="self-start rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-60">
        {pending ? "Making link…" : "Make invite link"}
      </button>
    </form>
  );
}

export function InviteRow({ id, label, roleLabel, expires }: Readonly<{ id: string; label: string | null; roleLabel: string; expires: string }>) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
      <span>
        <span className="font-medium">{label ?? "Invite"}</span>
        <span className="ml-2 text-xs text-muted">
          {roleLabel} · link works until {expires}
        </span>
        {error ? <span className="ml-2 text-xs text-danger">{error}</span> : null}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setError((await cancelInvite(id)).error))}
        className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink disabled:opacity-60"
      >
        Cancel invite
      </button>
    </li>
  );
}

export function MemberActions({ userId, email, role }: Readonly<{ userId: string; email: string; role: MemberRole }>) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role for {email}
      </label>
      <select
        id={`role-${userId}`}
        value={role}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => setError((await changeRole(userId, next)).error));
        }}
        className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold"
      >
        {INVITE_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          start(async () => {
            setError((await removeMember(userId)).error);
            setConfirming(false);
          });
        }}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${confirming ? "border-danger text-danger" : "border-line hover:border-ink"}`}
      >
        {confirming ? "Tap again to remove" : "Remove"}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
