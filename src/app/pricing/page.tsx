import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { BRAND_NAME } from "@/lib/brand";
import { formatInr } from "@/lib/domain/money";
import { listPlans, type Plan } from "@/lib/studio/billing";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Monthly plans for photographers and studios using ${BRAND_NAME}. Start with a free trial.`,
};

export default function PricingPage() {
  return (
    <main className="flex-1">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-8">
        <h1 className="font-display text-5xl italic sm:text-6xl">Simple monthly plans</h1>
        <p className="mt-4 max-w-xl text-muted">
          Every plan includes auto-editing with all 25 looks, the PC app, private galleries with favourites and downloads, and
          the live polaroid corner. Prices in Indian rupees; GST extra where it applies.
        </p>
        <Suspense fallback={<div className="mt-12 h-96 animate-pulse rounded-3xl bg-line/50" aria-hidden />}>
          <Plans />
        </Suspense>
        <p className="mt-10 text-sm text-muted">
          A shoot is one event or one photo-delivery project. Need more? Write to us for a studio plan.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}

function rows(plan: Plan): string[] {
  return [
    `${plan.events_per_month} shoot${plan.events_per_month === 1 ? "" : "s"} a month`,
    `Up to ${plan.photos_per_event.toLocaleString("en-IN")} photos per shoot`,
    `Galleries open ${plan.gallery_days} days`,
    `${plan.team_seats} team member${plan.team_seats === 1 ? "" : "s"}`,
    plan.remove_branding ? "Your brand only, no mention of us" : `"Delivered with ${BRAND_NAME}" in gallery footers`,
  ];
}

async function Plans() {
  const plans = await listPlans();
  const featured = plans.find((p) => p.id === "starter")?.id;
  return (
    <ul className="mt-12 grid gap-5 md:grid-cols-3">
      {plans.map((plan) => {
        const highlight = plan.id === featured;
        return (
          <li key={plan.id} className={`flex flex-col rounded-3xl border p-7 ${highlight ? "border-ink bg-surface shadow-lg" : "border-line bg-surface/60"}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              {highlight ? <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">Most studios</span> : null}
            </div>
            <p className="mt-4">
              <span className="font-display text-5xl italic">{plan.is_trial ? "Free" : formatInr(plan.price_paise)}</span>
              {plan.is_trial ? null : <span className="text-sm text-muted"> / month</span>}
            </p>
            <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
              {rows(plan).map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="text-accent" aria-hidden>
                    ✓
                  </span>
                  {r}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className={`mt-8 rounded-full px-5 py-3 text-center text-sm font-semibold transition ${highlight ? "bg-ink text-paper hover:opacity-90" : "border border-line hover:border-ink"}`}
            >
              {plan.is_trial ? "Start free" : `Start with ${plan.name}`}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
