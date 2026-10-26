import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "../auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your studio."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-ink underline underline-offset-4">
            Create a studio
          </Link>
        </>
      }
    >
      {/* Reads ?next and ?error from the URL, so it renders per request. */}
      <Suspense fallback={<div className="h-56" aria-hidden />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
