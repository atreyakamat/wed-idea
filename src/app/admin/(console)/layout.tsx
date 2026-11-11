import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { requireAdmin } from "@/lib/admin/session";
import { AdminNav, NavLinks } from "./admin-nav";

export default function AdminConsoleLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-display text-xl italic">
              Cute Wedding Polaroid
            </Link>
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-paper">Admin</span>
          </div>
          <Suspense fallback={<div className="h-9 w-24" aria-hidden />}>
            <Account />
          </Suspense>
        </div>
        <div className="mx-auto max-w-6xl px-2 sm:px-3">
          <Suspense fallback={<NavLinks pathname={null} />}>
            <AdminNav />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}

async function Account() {
  const admin = await requireAdmin();
  return (
    <form action={signOut} className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted md:inline">{admin.email}</span>
      <button type="submit" className="rounded-full border border-line px-4 py-2 font-medium hover:border-ink">
        Sign out
      </button>
    </form>
  );
}
