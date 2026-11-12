import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "../auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your studio", robots: { index: false, follow: false } };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your studio"
      subtitle="Run polaroid stations at your weddings and events."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      {/* Reads ?next from the URL (a team invite), so it renders per request. */}
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </AuthCard>
  );
}
