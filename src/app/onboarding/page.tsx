import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listStudios, requireUser } from "@/lib/auth";
import { StudioForm } from "./studio-form";

export const metadata: Metadata = { title: "Set up your studio", robots: { index: false, follow: false } };

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <p className="font-display text-xl italic">Cute Wedding Polaroid</p>
        <div className="mt-6 rounded-2xl border border-line bg-surface p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-widest text-accent">Step 1 of 1</p>
          <h1 className="mt-2 font-display text-3xl italic">Set up your studio</h1>
          <p className="mt-1 text-sm text-muted">
            Your studio holds your events, team and designs. You can rename it later.
          </p>
          <div className="mt-8">
            <Suspense fallback={<div className="h-56" aria-hidden />}>
              <Onboarding />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

async function Onboarding() {
  const user = await requireUser("/onboarding");
  if ((await listStudios(user.id)).length > 0) redirect("/dashboard");
  return <StudioForm />;
}
