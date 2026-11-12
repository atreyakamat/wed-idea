import { Suspense } from "react";
import { UsageMeter } from "@/components/dashboard/usage-meter";
import { canManage, requireStudio, type MemberRole } from "@/lib/auth";
import { formatIstDate } from "@/lib/events/time";
import { listPlans } from "@/lib/studio/billing";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/team";
import { InviteForm, InviteRow, MemberActions } from "./team-client";

export const metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl italic">Team</h1>
      <p className="mt-1 text-sm text-muted">Bring in second shooters and editors. Everyone works in the same studio, projects and events.</p>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-line/40" aria-hidden />}>
        <Team />
      </Suspense>
    </div>
  );
}

type Member = { user_id: string; email: string; role: MemberRole; joined_at: string };
type Invite = { id: string; role: "admin" | "operator"; label: string | null; created_at: string; expires_at: string; accepted_at: string | null };

/** Invites whose link still works. */
function stillOpen(invites: Invite[], now: number = Date.now()): Invite[] {
  return invites.filter((i) => new Date(i.expires_at).getTime() > now);
}

async function Team() {
  const { user, studio } = await requireStudio("/dashboard/team");
  const supabase = await createClient();
  const manager = canManage(studio.role);
  const [{ data: members }, invites, plans] = await Promise.all([
    supabase.rpc("studio_team", { p_org: studio.id }),
    manager
      ? supabase.from("organization_invites").select("id, role, label, created_at, expires_at, accepted_at").eq("organization_id", studio.id).is("accepted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    listPlans(),
  ]);
  const team = (members ?? []) as Member[];
  const open = stillOpen((invites.data ?? []) as Invite[]);
  const plan = plans.find((p) => p.id === studio.planId);
  const seatsLeft = plan ? plan.team_seats - team.length : null;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8" aria-labelledby="members-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="members-heading" className="text-lg font-semibold">
            People
          </h2>
          {plan ? (
            <div className="w-full max-w-xs">
              <UsageMeter label="Team seats" used={team.length} limit={plan.team_seats} unit="seats" />
            </div>
          ) : null}
        </div>
        <ul className="mt-4 divide-y divide-line">
          {team.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {m.email}
                  {m.user_id === user.id ? <span className="ml-2 text-xs font-normal text-muted">(you)</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {ROLE_LABELS[m.role]} · joined {formatIstDate(m.joined_at)}
                </p>
              </div>
              {studio.role === "owner" && m.role !== "owner" && m.user_id !== user.id ? <MemberActions userId={m.user_id} email={m.email} role={m.role} /> : null}
            </li>
          ))}
        </ul>
      </section>

      {manager ? (
        <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8" aria-labelledby="invite-heading">
          <h2 id="invite-heading" className="text-lg font-semibold">
            Invite someone
          </h2>
          <p className="mt-1 text-sm text-muted">You get a private link to send on WhatsApp. It works once, for 7 days. They sign in or make an account, and they&apos;re in.</p>
          <div className="mt-5">
            <InviteForm canInviteAdmins={studio.role === "owner"} seatsLeft={seatsLeft} />
          </div>
          {open.length ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Waiting to join</h3>
              <ul className="mt-2 divide-y divide-line">
                {open.map((i) => (
                  <InviteRow key={i.id} id={i.id} label={i.label} roleLabel={ROLE_LABELS[i.role]} expires={formatIstDate(i.expires_at)} />
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-muted">Ask a studio owner or admin to invite people.</p>
      )}
    </div>
  );
}
