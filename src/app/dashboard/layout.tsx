import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StudioBanner } from "@/components/dashboard/studio-banner";
import { requireStudio } from "@/lib/auth";
import { studioNotice } from "@/lib/studio/status";
import { signOut } from "../(auth)/actions";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Dashboard" },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-display text-xl italic">
              Cute Wedding Polaroid
            </Link>
            <Suspense fallback={null}>
              <StudioName />
            </Suspense>
          </div>
          <Suspense fallback={<div className="h-9 w-24" aria-hidden />}>
            <Account />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Suspense fallback={null}>
          <AccountNotice />
        </Suspense>
        {children}
      </div>
    </div>
  );
}

async function StudioName() {
  const { studio } = await requireStudio();
  return (
    <span className="hidden rounded-full bg-line/60 px-3 py-1 text-xs font-medium text-muted sm:inline">
      {studio.name} · {studio.role}
    </span>
  );
}

async function AccountNotice() {
  const { studio } = await requireStudio();
  const notice = studioNotice(studio);
  return notice ? <StudioBanner notice={notice} /> : null;
}

async function Account() {
  const { user } = await requireStudio();
  return (
    <form action={signOut} className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted md:inline">{user.email}</span>
      <button type="submit" className="rounded-full border border-line px-4 py-2 font-medium hover:border-ink">
        Sign out
      </button>
    </form>
  );
}
