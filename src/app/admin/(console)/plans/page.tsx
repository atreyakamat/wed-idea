import type { Metadata } from "next";
import { Suspense } from "react";
import { listAllPlans, listStudios } from "@/lib/admin/queries";
import { PlanEditor } from "./plan-editor";

export const metadata: Metadata = { title: "Plans" };

export default function PlansPage() {
  return (
    <>
      <h1 className="font-display text-4xl italic">Plans</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Prices and limits for every studio on each plan. Changes apply straight away and are recorded in the audit log. Lowering a limit
        never removes anything a studio already has; it only stops new events, photos or seats beyond it.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-line/60" aria-hidden />}>
        <Plans />
      </Suspense>
    </>
  );
}

async function Plans() {
  const [plans, studios] = await Promise.all([listAllPlans(), listStudios()]);
  const counts = new Map<string, number>();
  for (const s of studios) counts.set(s.plan_id, (counts.get(s.plan_id) ?? 0) + 1);
  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
      {plans.map((plan) => (
        <PlanEditor key={plan.id} plan={plan} studios={counts.get(plan.id) ?? 0} />
      ))}
    </div>
  );
}
