import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/app/(auth)/auth-card";
import { signOut } from "@/app/(auth)/actions";
import { adminNext } from "@/lib/admin/next";
import { requireAdminUser } from "@/lib/admin/session";
import { createClient } from "@/lib/supabase/server";
import { EnrolForm, VerifyForm } from "./mfa-forms";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default function MfaPage({ searchParams }: PageProps<"/admin/mfa">) {
  return (
    <AuthCard
      title="Two-step sign-in"
      subtitle="Admin access needs a code from your authenticator app."
      footer={
        <form action={signOut}>
          <button type="submit" className="font-semibold text-ink underline underline-offset-4">
            Sign out
          </button>
        </form>
      }
    >
      <Suspense fallback={<div className="h-48" aria-hidden />}>
        <Mfa searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Mfa({ searchParams }: Readonly<{ searchParams: PageProps<"/admin/mfa">["searchParams"] }>) {
  const next = adminNext((await searchParams).next);
  const user = await requireAdminUser(`/admin/mfa?next=${encodeURIComponent(next)}`);
  if (user.aal === "aal2") redirect(next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error("Couldn't load your sign-in settings.");

  const factor = data.totp[0];
  return factor ? <VerifyForm factorId={factor.id} next={next} /> : <EnrolForm next={next} />;
}
