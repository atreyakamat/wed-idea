import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/app/(auth)/auth-card";
import { allow, clientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { INVITE_TOKEN_PATTERN, ROLE_LABELS } from "@/lib/team";
import type { MemberRole } from "@/lib/auth";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join a studio", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Suspense fallback={<AuthCard title="Join a studio" subtitle="Checking your invite…">{null}</AuthCard>}>
      <Invite params={params} />
    </Suspense>
  );
}

type Preview = { studio_name: string; role: MemberRole; state: "open" | "used" | "expired" };

async function Invite({ params }: Readonly<{ params: PageProps<"/invite/[token]">["params"] }>) {
  const { token } = await params;
  const supabase = await createClient();
  let preview: Preview | null = null;
  if (INVITE_TOKEN_PATTERN.test(token) && (await allow(`invite-view:${await clientIp()}`, 60, 60))) {
    const { data } = await supabase.rpc("invite_preview", { p_token: token });
    preview = ((data ?? []) as Preview[])[0] ?? null;
  }
  if (!preview) {
    return (
      <AuthCard title="Invite not found" subtitle="This link isn't valid. Check you copied all of it, or ask for a new one.">
        <Link href="/" className="text-sm font-semibold underline underline-offset-4">
          Go to the home page
        </Link>
      </AuthCard>
    );
  }
  if (preview.state !== "open") {
    return (
      <AuthCard title={preview.state === "used" ? "Invite already used" : "Invite expired"} subtitle={`Ask ${preview.studio_name} for a new link.`}>
        <Link href="/dashboard" className="text-sm font-semibold underline underline-offset-4">
          Already joined? Open your dashboard
        </Link>
      </AuthCard>
    );
  }

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  const next = encodeURIComponent(`/invite/${token}`);
  const role = ROLE_LABELS[preview.role].toLowerCase();

  return (
    <AuthCard title={`Join ${preview.studio_name}`} subtitle={`You've been invited as ${role === "admin" ? "an admin" : `a ${role}`}. Upload, review and share the studio's photos together.`}>
      {signedIn ? (
        <div className="flex flex-col gap-3">
          <JoinButton token={token} />
          <p className="text-xs text-muted">
            Signed in as {email ?? "you"}. Not you?{" "}
            <Link href={`/login?next=${next}`} className="underline underline-offset-4">
              Use another account
            </Link>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Link href={`/signup?next=${next}`} className="rounded-full bg-ink px-5 py-3 text-center text-sm font-semibold text-paper hover:opacity-90">
            Create an account to join
          </Link>
          <Link href={`/login?next=${next}`} className="rounded-full border border-line px-5 py-3 text-center text-sm font-semibold hover:border-ink">
            I have an account
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
